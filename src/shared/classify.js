// Power Link — URL classifier.
// Plain script (no import/export) so it works in content scripts, executeScript and ES modules
// (as a side-effect import). Exposes globalThis.PLClassify(url) and globalThis.PLNormalize(url).
(function () {
  const IG_RESERVED = new Set(['explore', 'accounts', 'stories', 'direct', 'reels', 'reel', 'p', 'tv', 'about', 'legal', 'developer', 'web', 'emails', 'challenge', 'your_activity', 'settings']);
  const X_RESERVED = new Set(['home', 'explore', 'i', 'search', 'notifications', 'messages', 'settings', 'compose', 'hashtag', 'intent', 'share', 'login', 'signup', 'tos', 'privacy', 'jobs']);
  const YT_ACCOUNT_PREFIX = /^\/(@[^/]+|channel\/UC[\w-]+|c\/[^/]+|user\/[^/]+)(\/(featured|videos|shorts|streams|playlists|community|about)?)?\/?$/;

  function normalize(url) {
    try {
      const u = new URL(url);
      u.hash = '';
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'si', 'feature', 'pp', 'fbclid', 'igsh', 'igshid'].forEach((p) => u.searchParams.delete(p));
      if (/youtube\.com$/.test(u.hostname.replace(/^(www|m)\./, '')) && u.pathname === '/watch') {
        const v = u.searchParams.get('v');
        return v ? `https://www.youtube.com/watch?v=${v}` : u.toString();
      }
      return u.toString().replace(/\/$/, '');
    } catch (e) { return url; }
  }

  function classify(url) {
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.replace(/^(www|m|mobile)\./, '');
    const path = u.pathname;
    const seg = path.split('/').filter(Boolean);
    const out = (platform, kind, extra) => Object.assign({ platform, kind, host }, extra || {});

    // YouTube
    if (host === 'youtube.com' || host === 'music.youtube.com') {
      if (path === '/watch' && u.searchParams.get('v')) return out('yt', 'post', { videoId: u.searchParams.get('v') });
      let m = path.match(/^\/(shorts|live|embed)\/([\w-]{6,})/);
      if (m) return out('yt', 'post', { videoId: m[2], isShort: m[1] === 'shorts' });
      m = path.match(YT_ACCOUNT_PREFIX);
      if (m) {
        const id = m[1];
        if (id.startsWith('@')) return out('yt', 'account', { handle: id });
        if (id.startsWith('channel/')) return out('yt', 'account', { channelId: id.slice(8) });
        return out('yt', 'account', { legacy: id });
      }
      return out('yt', 'other');
    }
    if (host === 'youtu.be' && seg[0]) return out('yt', 'post', { videoId: seg[0] });

    // TikTok
    if (host.endsWith('tiktok.com')) {
      if (seg[0] && seg[0].startsWith('@')) {
        if ((seg[1] === 'video' || seg[1] === 'photo') && seg[2]) return out('tt', 'post', { handle: seg[0], postId: seg[2] });
        if (seg.length === 1) return out('tt', 'account', { handle: seg[0] });
      }
      if (host.startsWith('vm.') || host.startsWith('vt.')) return out('tt', 'post');
      return out('tt', 'other');
    }

    // Instagram
    if (host.endsWith('instagram.com')) {
      if (['p', 'reel', 'reels', 'tv'].includes(seg[0]) && seg[1]) return out('ig', 'post', { postId: seg[1], postType: seg[0] === 'p' ? '피드' : '릴스' });
      if (seg[1] && ['p', 'reel'].includes(seg[1]) && seg[2]) return out('ig', 'post', { postId: seg[2], postType: seg[1] === 'p' ? '피드' : '릴스' });
      if (seg.length === 1 && !IG_RESERVED.has(seg[0])) return out('ig', 'account', { handle: '@' + seg[0] });
      return out('ig', 'other');
    }

    // X / Twitter
    if (host === 'x.com' || host === 'twitter.com') {
      if (seg[1] === 'status' && seg[2]) return out('x', 'post', { handle: '@' + seg[0], postId: seg[2] });
      if (seg.length === 1 && !X_RESERVED.has(seg[0].toLowerCase())) return out('x', 'account', { handle: '@' + seg[0] });
      return out('x', 'other');
    }

    // Blogs
    if (host === 'blog.naver.com') {
      if (path.includes('PostView') && u.searchParams.get('logNo')) return out('blog', 'post', { blogId: u.searchParams.get('blogId') });
      if (seg.length >= 2 && /^\d+$/.test(seg[1])) return out('blog', 'post', { blogId: seg[0] });
      if (seg.length === 1 || path.includes('PostList')) return out('blog', 'account', { blogId: seg[0] || u.searchParams.get('blogId') });
      return out('blog', 'other');
    }
    if (host.endsWith('.tistory.com')) {
      if (seg.length === 0) return out('blog', 'account');
      if (/^\d+$/.test(seg[0]) || seg[0] === 'entry') return out('blog', 'post');
      return out('blog', 'other');
    }
    if (host === 'brunch.co.kr' || host === 'velog.io' || host === 'medium.com') {
      if (seg[0] && seg[0].startsWith('@')) return seg.length === 1 ? out('blog', 'account', { handle: seg[0] }) : out('blog', 'post', { handle: seg[0] });
      return out('blog', 'other');
    }
    if (host.endsWith('.blogspot.com') || host.endsWith('.wordpress.com') || host.endsWith('.substack.com')) {
      return seg.length === 0 ? out('blog', 'account') : out('blog', 'post');
    }

    return out('web', 'post');
  }

  globalThis.PLClassify = classify;
  globalThis.PLNormalize = normalize;
})();
