# Power Link bridge host — Chrome native messaging (Windows PowerShell 5.1)
# Protocol: 4-byte little-endian length + UTF-8 JSON over stdin/stdout.
# Accepted messages: hello / recent / command / ping — nothing else.
# Commands between profiles: activate / forget / close (a URL) — nothing else.
# The host never launches programs and only touches profile-*.json / cmd-*.json
# files inside its own data directory.
#
# Data dir:   %LOCALAPPDATA%\PowerLink\bridge  (override: POWERLINK_BRIDGE_DIR)
# Sharing:    each profile writes profile-<id>.json {profileId,name,alive,items};
#             commands travel as cmd-<targetId>-<guid>.json, polled every second.
#             A profile is "online" while its alive timestamp is under 30 s old
#             (override: POWERLINK_BRIDGE_ONLINE_MS, used by tests).

$ErrorActionPreference = 'Stop'

$Enc = New-Object System.Text.UTF8Encoding($false)
$In  = [Console]::OpenStandardInput()
$Out = [Console]::OpenStandardOutput()

$DataDir = if ($env:POWERLINK_BRIDGE_DIR) { $env:POWERLINK_BRIDGE_DIR } else { Join-Path $env:LOCALAPPDATA 'PowerLink\bridge' }
$OnlineMs = 30000
if ("$env:POWERLINK_BRIDGE_ONLINE_MS" -match '^\d+$') { $OnlineMs = [int]$env:POWERLINK_BRIDGE_ONLINE_MS }
# Refresh our own alive stamp well inside the online window, or peers see us flicker offline.
$AliveRefreshMs = [Math]::Min(10000, [Math]::Max(500, [int]($OnlineMs / 3)))
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

$script:ProfileId = $null
$script:ProfileName = ''
$script:Items = @()
$script:LastDigest = $null
$script:LastAlive = [DateTime]::MinValue

function Get-NowMs { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }

function Send-Msg($obj) {
  $json = ConvertTo-Json -InputObject $obj -Depth 10 -Compress
  $bytes = $Enc.GetBytes($json)
  if ($bytes.Length -gt 900000) { return }  # Chrome caps host->browser messages at 1 MB
  $len = [BitConverter]::GetBytes([UInt32]$bytes.Length)
  $Out.Write($len, 0, 4)
  $Out.Write($bytes, 0, $bytes.Length)
  $Out.Flush()
}

function Get-CleanId($id) {
  $s = [string]$id
  if ($s -notmatch '^[A-Za-z0-9_-]{1,64}$') { return $null }  # reject, never "repair"
  return $s
}

# Keep only the fields the side panel needs, with sane size limits.
function Get-CleanItems($raw) {
  $out = New-Object System.Collections.ArrayList
  if ($null -eq $raw) { return ,@() }
  foreach ($it in @($raw)) {
    if ($out.Count -ge 300) { break }
    $url = [string]$it.url
    if ($url -notmatch '^https?://' -or $url.Length -gt 4096) { continue }
    $title = [string]$it.title
    if ($title.Length -gt 500) { $title = $title.Substring(0, 500) }
    $at = 0L
    try { $at = [long]$it.at } catch { $at = 0L }
    $fav = [string]$it.favIconUrl
    if ($fav -notmatch '^(https?:|data:image/)' -or $fav.Length -gt 2048) { $fav = '' }
    [void]$out.Add(@{ url = $url; title = $title; at = $at; favIconUrl = $fav })
  }
  return ,$out.ToArray()
}

function Write-OwnProfile {
  if (-not $script:ProfileId) { return }
  $obj = @{ profileId = $script:ProfileId; name = $script:ProfileName; alive = (Get-NowMs); items = $script:Items }
  $path = Join-Path $DataDir ("profile-" + $script:ProfileId + ".json")
  $tmp = $path + '.tmp'
  [System.IO.File]::WriteAllText($tmp, (ConvertTo-Json -InputObject $obj -Depth 10 -Compress), $Enc)
  Move-Item -LiteralPath $tmp -Destination $path -Force
  $script:LastAlive = Get-Date
}

function Read-OtherProfiles {
  $profiles = New-Object System.Collections.ArrayList
  $now = Get-NowMs
  foreach ($f in @(Get-ChildItem -LiteralPath $DataDir -Filter 'profile-*.json' -File -ErrorAction SilentlyContinue)) {
    if ($script:ProfileId -and $f.Name -eq ("profile-" + $script:ProfileId + ".json")) { continue }
    $p = $null
    try { $p = [System.IO.File]::ReadAllText($f.FullName, $Enc) | ConvertFrom-Json } catch { continue }
    $id = Get-CleanId $p.profileId
    if (-not $id) { continue }
    if ($script:ProfileId -and $id -eq $script:ProfileId) { continue }
    $alive = 0L
    try { $alive = [long]$p.alive } catch { $alive = 0L }
    $name = [string]$p.name
    if ($name.Length -gt 60) { $name = $name.Substring(0, 60) }
    [void]$profiles.Add(@{
      id     = $id
      name   = $name
      alive  = $alive
      online = (($now - $alive) -lt $OnlineMs)
      items  = (Get-CleanItems $p.items)
    })
  }
  return ,$profiles.ToArray()
}

# Push the other profiles to the extension only when something they show changed
# (items, name, online flag) — alive-timestamp refreshes alone stay silent.
function Push-Others([bool]$force) {
  $profiles = Read-OtherProfiles
  $parts = foreach ($p in $profiles) { "$($p.id)|$($p.name)|$($p.online)|" + (ConvertTo-Json -InputObject $p.items -Depth 5 -Compress) }
  $digest = ($parts -join "`n")
  if ($force -or $digest -ne $script:LastDigest) {
    Send-Msg @{ type = 'others'; profiles = $profiles }
    $script:LastDigest = $digest
  }
}

function Read-MyCommands {
  if (-not $script:ProfileId) { return }
  foreach ($f in @(Get-ChildItem -LiteralPath $DataDir -Filter ("cmd-" + $script:ProfileId + "-*.json") -File -ErrorAction SilentlyContinue)) {
    try {
      $c = [System.IO.File]::ReadAllText($f.FullName, $Enc) | ConvertFrom-Json
      $type = [string]$c.command.type
      $url = [string]$c.command.url
      if (($type -eq 'activate' -or $type -eq 'forget' -or $type -eq 'close') -and $url -match '^https?://') {
        Send-Msg @{ type = 'command'; command = @{ type = $type; url = $url } }
      }
    } catch { }
    Remove-Item -LiteralPath $f.FullName -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-Message($m) {
  $type = [string]$m.type
  if ($type -eq 'hello') {
    $id = Get-CleanId $m.profileId
    if (-not $id) { Send-Msg @{ type = 'hello'; ok = $false }; return }
    $script:ProfileId = $id
    $name = [string]$m.name
    if ($name.Length -gt 60) { $name = $name.Substring(0, 60) }
    $script:ProfileName = $name
    Write-OwnProfile
    Send-Msg @{ type = 'hello'; ok = $true; profileId = $id }
    Push-Others $true
  } elseif ($type -eq 'recent') {
    if (-not $script:ProfileId) { return }
    if ($null -ne $m.PSObject.Properties['name']) {
      $name = [string]$m.name
      if ($name.Length -gt 60) { $name = $name.Substring(0, 60) }
      $script:ProfileName = $name
    }
    $script:Items = Get-CleanItems $m.items
    Write-OwnProfile
  } elseif ($type -eq 'command') {
    $target = Get-CleanId $m.target
    $ctype = [string]$m.command.type
    $url = [string]$m.command.url
    if (-not $target -or ($ctype -ne 'activate' -and $ctype -ne 'forget' -and $ctype -ne 'close') -or $url -notmatch '^https?://' -or $url.Length -gt 4096) { return }
    $obj = @{ from = $script:ProfileId; at = (Get-NowMs); command = @{ type = $ctype; url = $url } }
    $path = Join-Path $DataDir ("cmd-" + $target + "-" + [Guid]::NewGuid().ToString('N') + ".json")
    [System.IO.File]::WriteAllText($path, (ConvertTo-Json -InputObject $obj -Depth 5 -Compress), $Enc)
  } elseif ($type -eq 'ping') {
    Send-Msg @{ type = 'pong'; at = (Get-NowMs) }
  }
}

function Read-Exact([int]$count) {
  $buf = New-Object byte[] $count
  $got = 0
  while ($got -lt $count) {
    $n = $In.Read($buf, $got, $count - $got)
    if ($n -le 0) { return $null }
    $got += $n
  }
  return ,$buf
}

# Main loop: wait up to 250 ms for the next message, otherwise do the 1 s poll
# (refresh own alive stamp, deliver queued commands, diff other profiles).
$headBuf = New-Object byte[] 4
$readTask = $null
$lastPoll = [DateTime]::MinValue
while ($true) {
  if ($null -eq $readTask) { $readTask = $In.ReadAsync($headBuf, 0, 4) }
  $done = $false
  try { $done = $readTask.Wait(250) } catch { break }
  if ($done) {
    $n = $readTask.Result
    $readTask = $null
    if ($n -le 0) { break }  # Chrome closed the pipe
    if ($n -lt 4) {
      $rest = Read-Exact (4 - $n)
      if ($null -eq $rest) { break }
      [Array]::Copy($rest, 0, $headBuf, $n, $rest.Length)
    }
    $len = [BitConverter]::ToUInt32($headBuf, 0)
    if ($len -lt 2 -or $len -gt 8000000) { break }
    $payload = Read-Exact ([int]$len)
    if ($null -eq $payload) { break }
    $m = $null
    try { $m = $Enc.GetString($payload) | ConvertFrom-Json } catch { }
    if ($m) { try { $null = Invoke-Message $m } catch { } }
  }
  try {
    if ($script:ProfileId -and ((Get-Date) - $lastPoll).TotalMilliseconds -ge 1000) {
      $lastPoll = Get-Date
      if (((Get-Date) - $script:LastAlive).TotalMilliseconds -ge $AliveRefreshMs) { Write-OwnProfile }
      $null = Read-MyCommands
      $null = Push-Others $false
    }
  } catch { }
}
