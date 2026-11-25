/* Guest share page (plan-share-link-ui, mockup share-link.pen): vanilla JS, tanpa build step.
   Alur: fetch meta publik → render topbar + board <img> + pin komentar (diskala ke ukuran img)
   + panel komentar + toolbar hand/comment/zoom. Identitas tamu: UUID di localStorage
   (`lakar_guest_id`) + nama (`lakar_guest_name`) — hanya komentar dengan guestId ini yang bisa
   diedit/dihapus. Share mati (revoked/kedaluwarsa/unknown) → state 404 yang identik. */
(function () {
  'use strict';

  var token = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  var API = '/api/shares/' + encodeURIComponent(token);
  var REPO_URL = 'https://github.com/fatmuh/lakar';
  var GUEST_ID_KEY = 'lakar_guest_id';
  var GUEST_NAME_KEY = 'lakar_guest_name';

  // ---- State ----
  var state = {
    meta: null,
    comments: [],
    zoom: 1,
    tool: 'hand', // 'hand' | 'comment'
    open: null, // {boardId, id} thread yang dibuka
    draft: null, // {boardId, x, y} pin komentar baru
    editing: null, // id komentar yang sedang diedit
    name: '',
    guestId: '',
    error: null,
  };

  try {
    state.name = localStorage.getItem(GUEST_NAME_KEY) || '';
    state.guestId = localStorage.getItem(GUEST_ID_KEY) || '';
    if (!state.guestId) {
      state.guestId = (crypto.randomUUID ? crypto.randomUUID() : 'g-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem(GUEST_ID_KEY, state.guestId);
    }
  } catch (e) {
    state.guestId = 'g-' + Math.random().toString(36).slice(2);
  }

  // ---- Helpers ----
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  var ICONS = {
    logo: '<svg viewBox="0 0 24 24"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>',
    external: '<svg viewBox="0 0 24 24"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/></svg>',
    hand: '<svg viewBox="0 0 24 24"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
    comment: '<svg viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
    minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></svg>',
    fit: '<svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    board: '<svg viewBox="0 0 24 24"><path d="M22 6H2M22 18H2M6 2v20M18 2v20"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
    pencil: '<svg viewBox="0 0 24 24"><path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.36-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
    unlink: '<svg viewBox="0 0 24 24"><path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/><path d="M8 2v3"/><path d="M2 8h3"/><path d="M16 19v3"/><path d="M19 16h3"/></svg>',
    user: '<svg viewBox="0 0 24 24"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    reply: '<svg viewBox="0 0 24 24"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>',
  };
  function icon(name) {
    var s = document.createElement('span');
    s.innerHTML = ICONS[name] || '';
    s.setAttribute('aria-hidden', 'true');
    return s.firstChild;
  }

  function req(method, url, body) {
    // guestId ikut sebagai header di semua request: server memakainya untuk flag `mine`
    // (guestId mentah tidak pernah diserialkan di respons publik).
    var headers = { 'x-lakar-guest-id': state.guestId };
    if (body !== undefined) headers['content-type'] = 'application/json';
    return fetch(url, {
      method: method,
      headers: headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      if (res.status === 204) return null;
      return res.json().then(function (j) {
        if (!res.ok || !j.ok) {
          var err = (j && j.error) || {};
          var e = new Error(err.message || 'HTTP ' + res.status);
          e.status = res.status;
          throw e;
        }
        return j.data;
      });
    });
  }
  var get = function (url) {
    return req('GET', url);
  };

  function timeAgo(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h';
    var d = Math.floor(h / 24);
    if (d < 30) return d + 'd';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function initial(name) {
    return (name || '?').trim().charAt(0).toUpperCase() || '?';
  }
  function boardOf(id) {
    return (state.meta.boards || []).find(function (b) {
      return b.id === id;
    });
  }
  function roots() {
    return state.comments.filter(function (c) {
      return c.parentId === undefined;
    });
  }
  function repliesOf(id) {
    return state.comments.filter(function (c) {
      return c.parentId === id;
    });
  }
  function commentById(id) {
    return state.comments.find(function (c) {
      return c.id === id;
    });
  }
  function isMine(c) {
    // `mine` dihitung server dari header x-lakar-guest-id — komentar orang lain tidak membawa guestId.
    return c.mine === true;
  }
  function commentsOn() {
    return !!(state.meta && state.meta.commentsEnabled);
  }

  // ---- Render ----
  var app = document.getElementById('app');

  function renderLoading() {
    app.innerHTML = '';
    var wrap = el('div', 'state');
    var top = el('div', 'state-top');
    var brand = el('span', 'brand');
    var logo = el('span', 'logo');
    logo.appendChild(icon('logo'));
    brand.appendChild(logo);
    brand.appendChild(el('span', null, 'lakar'));
    top.appendChild(brand);
    var body = el('div', 'state-body');
    body.appendChild(el('div', 'spinner'));
    body.appendChild(el('p', null, 'Loading snapshot'));
    wrap.appendChild(top);
    wrap.appendChild(body);
    app.appendChild(wrap);
  }

  function renderDead() {
    app.innerHTML = '';
    document.title = 'Link not found · Lakar';
    var wrap = el('div', 'state');
    var top = el('div', 'state-top');
    var brand = el('span', 'brand');
    var logo = el('span', 'logo');
    logo.appendChild(icon('logo'));
    brand.appendChild(logo);
    brand.appendChild(el('span', null, 'lakar'));
    top.appendChild(brand);
    var body = el('div', 'state-body');
    var ic = el('div', 'icon');
    ic.appendChild(icon('unlink'));
    body.appendChild(ic);
    body.appendChild(el('h1', null, "This link doesn't work anymore"));
    body.appendChild(el('p', null, 'It was revoked or it expired. Ask the person who shared it for a new link.'));
    var go = el('a', 'btn primary', 'Go to lakar.design');
    go.href = REPO_URL;
    go.target = '_blank';
    go.rel = 'noopener';
    body.appendChild(go);
    body.appendChild(el('span', 'code', '404'));
    wrap.appendChild(top);
    wrap.appendChild(body);
    app.appendChild(wrap);
  }

  function render() {
    var meta = state.meta;
    document.title = meta.title + ' · Lakar';
    app.innerHTML = '';
    var layout = el('div', 'layout');

    // Top bar.
    var top = el('header', 'topbar');
    var brand = el('a', 'brand');
    brand.href = REPO_URL;
    brand.target = '_blank';
    brand.rel = 'noopener';
    var logo = el('span', 'logo');
    logo.appendChild(icon('logo'));
    brand.appendChild(logo);
    brand.appendChild(el('span', null, 'lakar'));
    top.appendChild(brand);
    top.appendChild(el('span', 'sep'));
    top.appendChild(el('span', 'doc-title', meta.title));
    var badge = el('span', 'badge');
    badge.appendChild(icon('eye'));
    badge.appendChild(el('span', null, commentsOn() ? 'Read-only snapshot' : 'View only'));
    top.appendChild(badge);
    top.appendChild(el('span', 'spacer'));
    top.appendChild(el('span', 'snapshot-meta', 'Snapshot · ' + fmtDate(meta.createdAt)));
    if (meta.permissions && meta.permissions.download) {
      var dl = el('a', 'btn');
      dl.href = API + '/download';
      dl.setAttribute('download', '');
      dl.appendChild(icon('download'));
      dl.appendChild(el('span', null, 'Download'));
      top.appendChild(dl);
    }
    var open = el('a', 'btn primary', 'Open in Lakar');
    open.href = REPO_URL;
    open.target = '_blank';
    open.rel = 'noopener';
    var oi = icon('board');
    open.prepend(oi);
    top.appendChild(open);
    layout.appendChild(top);

    // Main: stage + panel.
    var main = el('div', 'main');
    var wrap = el('div', 'stage-wrap');
    var stage = el('div', 'stage ' + state.tool);
    stage.id = 'stage';
    var boards = el('div', 'boards');
    meta.boards.forEach(function (b) {
      boards.appendChild(renderBoard(b));
    });
    stage.appendChild(boards);
    wrap.appendChild(stage);
    wrap.appendChild(renderToolbar());
    main.appendChild(wrap);
    if (commentsOn()) main.appendChild(renderPanel());
    layout.appendChild(main);
    app.appendChild(layout);
  }

  function boardWidthPx(b) {
    return Math.round(b.w * state.zoom);
  }

  function renderBoard(b) {
    var root = el('div', 'board');
    root.dataset.board = b.id;
    root.appendChild(el('div', 'board-name', b.name));
    var frame = el('div', 'board-frame');
    frame.style.width = boardWidthPx(b) + 'px';
    var img = el('img');
    img.src = b.imageUrl;
    img.alt = b.name;
    img.draggable = false;
    frame.appendChild(img);

    var pins = el('div', 'pins');
    roots()
      .filter(function (c) {
        return c.boardId === b.id;
      })
      .forEach(function (c) {
        var p = el('button', 'pin' + (isMine(c) ? ' mine' : '') + (state.open && state.open.id === c.id ? ' active' : ''), initial(c.author));
        p.style.left = (c.x / b.w) * 100 + '%';
        p.style.top = (c.y / b.h) * 100 + '%';
        p.title = c.author;
        p.type = 'button';
        p.addEventListener('click', function (e) {
          e.stopPropagation();
          state.draft = null;
          state.editing = null;
          state.open = state.open && state.open.id === c.id ? null : { boardId: c.boardId, id: c.id };
          render();
        });
        pins.appendChild(p);
      });
    if (state.draft && state.draft.boardId === b.id) {
      var dp = el('span', 'pin draft', initial(state.name));
      dp.style.left = (state.draft.x / b.w) * 100 + '%';
      dp.style.top = (state.draft.y / b.h) * 100 + '%';
      pins.appendChild(dp);
    }
    frame.appendChild(pins);

    // Klik pada board dengan tool comment → pin draft (harus sudah punya nama).
    frame.addEventListener('click', function (e) {
      if (state.tool !== 'comment' || !commentsOn()) return;
      var r = img.getBoundingClientRect();
      var x = Math.round(((e.clientX - r.left) / r.width) * b.w);
      var y = Math.round(((e.clientY - r.top) / r.height) * b.h);
      if (x < 0 || y < 0 || x > b.w || y > b.h) return;
      // Klik yang membuat draft tidak boleh sampai ke listener document — di sana klik di luar
      // pin/kartu menutup draft (target di-resolve pada pohon lama yang sudah ter-detach).
      e.stopPropagation();
      state.open = null;
      state.draft = { boardId: b.id, x: x, y: y };
      render();
    });

    // Kartu thread/composer melayang di dalam frame board.
    var anchor = null;
    if (state.open && state.open.boardId === b.id) {
      var c = commentById(state.open.id);
      if (c) anchor = { x: c.x / b.w, y: c.y / b.h };
    }
    if (state.draft && state.draft.boardId === b.id) anchor = { x: state.draft.x / b.w, y: state.draft.y / b.h };
    if (anchor) frame.appendChild(renderCard(anchor, boardWidthPx(b)));

    root.appendChild(frame);
    return root;
  }

  /** Kartu melayang di samping pin (mockup nFxUNk "Comment"): thread + composer, atau composer draft. */
  function renderCard(anchor, boardPx) {
    var card = el('div', 'card');
    var w = 300;
    var left = anchor.x * boardPx + 20;
    if (left + w + 12 > boardPx) left = Math.max(4, anchor.x * boardPx - w - 20);
    card.style.left = left + 'px';
    card.style.top = Math.max(4, anchor.y * boardPx) + 'px';

    var head = el('div', 'card-head');
    head.appendChild(el('span', null, 'Comment'));
    var c = state.open ? commentById(state.open.id) : null;
    var locName = c ? boardOf(c.boardId) : state.draft ? boardOf(state.draft.boardId) : null;
    var loc = el('span', 'loc');
    loc.appendChild(icon('board'));
    loc.appendChild(el('span', null, locName ? locName.name : ''));
    head.appendChild(loc);
    var close = el('button', 'x');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    close.appendChild(icon('x'));
    close.addEventListener('click', function () {
      state.open = null;
      state.draft = null;
      state.editing = null;
      render();
    });
    head.appendChild(close);
    card.appendChild(head);

    var body = el('div', 'card-body');
    if (c) {
      body.appendChild(renderMsg(c));
      repliesOf(c.id).forEach(function (r) {
        body.appendChild(renderMsg(r));
      });
    }
    card.appendChild(body);

    if (state.name) {
      card.appendChild(renderComposer(c ? c.id : undefined));
    } else {
      card.appendChild(renderNameRow());
    }
    card.addEventListener('click', function (e) {
      e.stopPropagation();
    });
    return card;
  }

  function renderMsg(c) {
    var msg = el('div', 'msg');
    var av = el('span', 'avatar' + (isMine(c) ? ' mine' : ''), initial(c.author));
    msg.appendChild(av);
    var main = el('div', 'msg-main');
    var meta = el('div', 'msg-meta');
    meta.appendChild(el('span', 'msg-author', c.author));
    meta.appendChild(el('span', 'chip' + (isMine(c) ? ' you' : ''), isMine(c) ? 'You' : 'Guest'));
    meta.appendChild(el('span', 'msg-time', timeAgo(c.createdAt)));
    main.appendChild(meta);
    if (state.editing === c.id) {
      var edit = el('div', 'msg-edit');
      var ta = el('textarea');
      ta.value = c.body;
      ta.maxLength = 2000;
      edit.appendChild(ta);
      var row = el('div', 'row');
      var cancel = el('button', null, 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', function () {
        state.editing = null;
        render();
      });
      var save = el('button', 'save', 'Save');
      save.type = 'button';
      save.addEventListener('click', function () {
        var text = ta.value.trim();
        if (!text) return;
        req('PATCH', API + '/comments/' + c.id, { guestId: state.guestId, body: text })
          .then(reloadComments)
          .then(function () {
            state.editing = null;
            render();
          })
          .catch(function (e) {
            alert(e.status === 403 ? "You can only edit your own comments." : 'Could not save the comment. Try again.');
          });
      });
      row.appendChild(cancel);
      row.appendChild(save);
      edit.appendChild(row);
      main.appendChild(edit);
    } else {
      main.appendChild(el('div', 'msg-text', c.body));
    }
    if (isMine(c) && state.editing !== c.id) {
      var actions = el('div', 'msg-actions');
      var eb = el('button', null, 'Edit');
      eb.type = 'button';
      eb.prepend(icon('pencil'));
      eb.addEventListener('click', function () {
        state.editing = c.id;
        render();
      });
      var db = el('button', 'danger', 'Delete');
      db.type = 'button';
      db.prepend(icon('trash'));
      db.addEventListener('click', function () {
        req('DELETE', API + '/comments/' + c.id, { guestId: state.guestId })
          .then(reloadComments)
          .then(function () {
            if (state.open && state.open.id === c.id) state.open = null;
            render();
          })
          .catch(function (e) {
            alert(e.status === 403 ? 'You can only delete your own comments.' : 'Could not delete the comment. Try again.');
          });
      });
      actions.appendChild(eb);
      actions.appendChild(db);
      main.appendChild(actions);
    }
    msg.appendChild(main);
    return msg;
  }

  function renderNameRow() {
    var box = el('div', 'composer-name');
    var input = el('input');
    input.placeholder = 'Your name';
    input.maxLength = 40;
    input.setAttribute('aria-label', 'Your name');
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var v = input.value.trim();
      if (!v) return;
      setName(v);
    });
    box.appendChild(input);
    return box;
  }

  function renderComposer(parentId) {
    var box = el('div', 'composer');
    var row = el('div', 'row');
    var ta = el('textarea');
    ta.placeholder = parentId ? 'Reply…' : 'Add a comment…';
    ta.maxLength = 2000;
    ta.setAttribute('aria-label', parentId ? 'Reply' : 'Add a comment');
    var send = el('button', 'send');
    send.type = 'button';
    send.setAttribute('aria-label', 'Send');
    send.appendChild(icon('send'));
    function submit() {
      var text = ta.value.trim();
      if (!text) return;
      send.disabled = true;
      var base = state.draft || commentById(parentId);
      var body = {
        boardId: base.boardId,
        x: base.x,
        y: base.y,
        author: state.name,
        body: text,
        guestId: state.guestId,
      };
      if (parentId !== undefined) body.parentId = parentId;
      req('POST', API + '/comments', body)
        .then(function (nc) {
          return reloadComments().then(function () {
            if (parentId === undefined) {
              state.draft = null;
              state.tool = 'hand';
              state.open = { boardId: nc.boardId, id: nc.id };
            }
            render();
          });
        })
        .catch(function () {
          send.disabled = false;
          alert('Could not post the comment. Try again.');
        });
    }
    send.addEventListener('click', submit);
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });
    row.appendChild(ta);
    row.appendChild(send);
    box.appendChild(row);
    var hint = el('div', 'hint');
    var av = el('span', 'avatar mine', initial(state.name));
    hint.appendChild(av);
    hint.appendChild(el('span', null, 'Posting as ' + state.name));
    hint.appendChild(el('span', 'chip', 'Guest'));
    hint.appendChild(el('span', 'enter', '↵ to send'));
    box.appendChild(hint);
    setTimeout(function () {
      ta.focus();
    }, 0);
    return box;
  }

  function renderPanel() {
    var panel = el('aside', 'panel');
    var head = el('div', 'panel-head');
    head.appendChild(el('span', null, 'Comments'));
    var n = state.comments.length;
    head.appendChild(el('span', 'count', String(n)));
    panel.appendChild(head);

    var list = el('div', 'panel-list');
    var listRoots = roots();
    if (!listRoots.length) {
      list.appendChild(el('div', 'panel-empty', 'No comments yet. Pick a name, then click anywhere on a board to drop a pin.'));
    }
    listRoots.forEach(function (c) {
      var t = el('div', 'thread' + (state.open && state.open.id === c.id ? ' active' : ''));
      var top = el('div', 'top');
      top.appendChild(el('span', 'avatar' + (isMine(c) ? ' mine' : ''), initial(c.author)));
      top.appendChild(el('span', 'author', c.author));
      top.appendChild(el('span', 'chip' + (isMine(c) ? ' you' : ''), isMine(c) ? 'You' : 'Guest'));
      top.appendChild(el('span', 'time', timeAgo(c.createdAt)));
      t.appendChild(top);
      t.appendChild(el('div', 'text', c.body));
      var foot = el('div', 'foot');
      var b = boardOf(c.boardId);
      if (b) {
        var loc = el('span', 'loc');
        loc.appendChild(icon('board'));
        loc.appendChild(el('span', null, b.name));
        foot.appendChild(loc);
      }
      var reps = repliesOf(c.id).length;
      if (reps) {
        var rr = el('span', 'replies');
        rr.appendChild(icon('reply'));
        rr.appendChild(el('span', null, reps + (reps === 1 ? ' reply' : ' replies')));
        foot.appendChild(rr);
      }
      t.appendChild(foot);
      t.addEventListener('click', function () {
        state.draft = null;
        state.editing = null;
        state.open = { boardId: c.boardId, id: c.id };
        render();
        var boardEl = document.querySelector('.board[data-board="' + CSS.escape(c.boardId) + '"]');
        if (boardEl) boardEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      });
      list.appendChild(t);
    });
    panel.appendChild(list);
    panel.appendChild(renderGuestBox());
    return panel;
  }

  /** Footer panel (mockup "Guest Composer"/"Guest Chip"): nama → "Add a comment"; bernama → identitas + Change. */
  function renderGuestBox() {
    var box = el('div', 'guest-box');
    if (!state.name) {
      box.appendChild(el('div', 'label', 'Comment as guest'));
      var input = el('input');
      input.placeholder = 'Your name';
      input.maxLength = 40;
      input.setAttribute('aria-label', 'Your name');
      var add = el('button', 'btn accent');
      add.appendChild(icon('comment'));
      add.appendChild(el('span', null, 'Add a comment'));
      function commit() {
        var v = input.value.trim();
        if (v) setName(v);
      }
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') commit();
      });
      add.addEventListener('click', function () {
        if (!state.name) {
          commit();
          if (!state.name) {
            input.focus();
            return;
          }
        }
        state.tool = 'comment';
        render();
      });
      box.appendChild(input);
      box.appendChild(add);
      box.appendChild(el('div', 'note', 'Pick a name, then click any spot on a board to drop a pin. No account; the name is kept in this browser only.'));
    } else {
      var id = el('div', 'guest-id');
      id.appendChild(el('span', 'avatar mine', initial(state.name)));
      var who = el('div');
      who.appendChild(el('div', 'name', state.name));
      who.appendChild(el('div', 'sub', 'Commenting as guest'));
      id.appendChild(who);
      var change = el('button', 'change', 'Change');
      change.type = 'button';
      change.addEventListener('click', function () {
        state.name = '';
        try {
          localStorage.removeItem(GUEST_NAME_KEY);
        } catch (e) {}
        render();
      });
      id.appendChild(change);
      box.appendChild(id);
      var add = el('button', 'btn accent');
      add.style.marginTop = '10px';
      add.appendChild(icon('comment'));
      add.appendChild(el('span', null, 'Add a comment'));
      add.addEventListener('click', function () {
        state.tool = state.tool === 'comment' ? 'hand' : 'comment';
        render();
      });
      box.appendChild(add);
    }
    return box;
  }

  function renderToolbar() {
    var bar = el('div', 'toolbar');
    var hand = el('button', state.tool === 'hand' ? 'active' : '');
    hand.type = 'button';
    hand.title = 'Hand (pan)';
    hand.setAttribute('aria-label', 'Hand');
    hand.appendChild(icon('hand'));
    hand.addEventListener('click', function () {
      state.tool = 'hand';
      render();
    });
    bar.appendChild(hand);
    if (commentsOn()) {
      var cm = el('button', state.tool === 'comment' ? 'active' : '');
      cm.type = 'button';
      cm.title = 'Comment';
      cm.setAttribute('aria-label', 'Comment');
      cm.appendChild(icon('comment'));
      cm.addEventListener('click', function () {
        if (state.tool !== 'comment' && !state.name) {
          var input = document.querySelector('.guest-box input');
          if (input) input.focus();
          return;
        }
        state.tool = state.tool === 'comment' ? 'hand' : 'comment';
        render();
      });
      bar.appendChild(cm);
    }
    bar.appendChild(el('span', 'divider'));
    var out = el('button');
    out.type = 'button';
    out.title = 'Zoom out';
    out.setAttribute('aria-label', 'Zoom out');
    out.appendChild(icon('minus'));
    out.addEventListener('click', function () {
      setZoom(state.zoom / 1.25);
    });
    bar.appendChild(out);
    var zl = el('button', 'zoom', Math.round(state.zoom * 100) + '%');
    zl.type = 'button';
    zl.title = 'Fit to width';
    zl.setAttribute('aria-label', 'Fit to width');
    zl.addEventListener('click', function () {
      state.zoom = fitZoom();
      render();
    });
    bar.appendChild(zl);
    var zi = el('button');
    zi.type = 'button';
    zi.title = 'Zoom in';
    zi.setAttribute('aria-label', 'Zoom in');
    zi.appendChild(icon('plus'));
    zi.addEventListener('click', function () {
      setZoom(state.zoom * 1.25);
    });
    bar.appendChild(zi);
    var fit = el('button');
    fit.type = 'button';
    fit.title = 'Fit to width';
    fit.setAttribute('aria-label', 'Fit to width');
    fit.appendChild(icon('fit'));
    fit.addEventListener('click', function () {
      state.zoom = fitZoom();
      render();
    });
    bar.appendChild(fit);
    return bar;
  }

  function setZoom(z) {
    state.zoom = Math.min(4, Math.max(0.1, z));
    render();
  }

  /** Zoom awal "fit": board terlebar muat penuh di lebar stage. */
  function fitZoom() {
    var stage = document.getElementById('stage');
    var avail = (stage ? stage.clientWidth : window.innerWidth) - 160;
    var max = Math.max.apply(
      null,
      state.meta.boards.map(function (b) {
        return b.w;
      }),
    );
    return Math.min(1, Math.max(0.1, avail / Math.max(1, max)));
  }

  function setName(v) {
    state.name = v;
    try {
      localStorage.setItem(GUEST_NAME_KEY, v);
    } catch (e) {}
    render();
  }

  function reloadComments() {
    if (!commentsOn()) return Promise.resolve();
    return get(API + '/comments').then(function (d) {
      state.comments = d.comments || [];
    });
  }

  // Drag-to-scroll saat tool hand aktif (delegasi di document: stage dibuat ulang tiap render).
  var pan = null;
  document.addEventListener('pointerdown', function (e) {
    if (state.tool !== 'hand' || state.draft) return;
    var stage = e.target.closest && e.target.closest('.stage');
    if (!stage || e.target.closest('.pin, .card, button, a, input, textarea')) return;
    pan = { x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop };
    stage.classList.add('grabbing');
  });
  document.addEventListener('pointermove', function (e) {
    if (!pan) return;
    var stage = document.getElementById('stage');
    if (!stage) return;
    stage.scrollLeft = pan.l - (e.clientX - pan.x);
    stage.scrollTop = pan.t - (e.clientY - pan.y);
  });
  document.addEventListener('pointerup', function () {
    pan = null;
    var stage = document.getElementById('stage');
    if (stage) stage.classList.remove('grabbing');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (state.open || state.draft) {
      state.open = null;
      state.draft = null;
      state.editing = null;
      render();
    }
  });
  // Klik di luar pin/kartu menutup thread yang terbuka.
  document.addEventListener('click', function (e) {
    if (!(state.open || state.draft)) return;
    if (e.target.closest && e.target.closest('.card, .pin, .panel, .toolbar')) return;
    state.open = null;
    state.draft = null;
    state.editing = null;
    render();
  });

  // ---- Boot ----
  renderLoading();
  get(API)
    .then(function (meta) {
      state.meta = meta;
      return reloadComments();
    })
    .then(function () {
      state.zoom = fitZoom();
      render();
    })
    .catch(function () {
      // 404 revoked/kedaluwarsa/unknown → state mati identik; error lain → state sama (halaman publik).
      renderDead();
    });
})();
