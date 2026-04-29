const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../database');
const auth = require('../middleware/auth');
const dayjs = require('dayjs');

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../public/uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
  else cb(new Error('只允许上传图片'));
}});

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : '';
}
function slugify(text) {
  return text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}

// 登录页
router.get('/login', (req, res) => {
  if (req.session.admin) return res.redirect('/admin');
  res.render('admin/login', { title: '管理员登录', error: null, blogName: getSetting('blog_name') });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE username=?').get(username);
  if (admin && bcrypt.compareSync(password, admin.password)) {
    req.session.admin = { id: admin.id, username: admin.username };
    return res.redirect('/admin');
  }
  res.render('admin/login', { title: '管理员登录', error: '用户名或密码错误', blogName: getSetting('blog_name') });
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// 仪表盘
router.get('/', auth, (req, res) => {
  const stats = {
    articles: db.prepare('SELECT COUNT(*) as c FROM articles WHERE status=?').get('published').c,
    drafts: db.prepare('SELECT COUNT(*) as c FROM articles WHERE status=?').get('draft').c,
    comments: db.prepare('SELECT COUNT(*) as c FROM comments WHERE status=?').get('pending').c,
    totalComments: db.prepare('SELECT COUNT(*) as c FROM comments').get().c,
    totalViews: db.prepare('SELECT SUM(views) as v FROM articles').get().v || 0,
  };
  const recentArticles = db.prepare('SELECT * FROM articles ORDER BY created_at DESC LIMIT 8').all();
  const recentComments = db.prepare('SELECT c.*, a.title as article_title FROM comments c JOIN articles a ON c.article_id=a.id WHERE c.status=? ORDER BY c.created_at DESC LIMIT 5').all('pending');
  res.render('admin/dashboard', { title: '仪表盘', admin: req.session.admin, stats, recentArticles, recentComments, blogName: getSetting('blog_name'), dayjs });
});

// ---- 文章管理 ----
router.get('/articles', auth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const perPage = 15;
  const offset = (page - 1) * perPage;
  const status = req.query.status || '';
  const q = req.query.q || '';
  let where = '1=1';
  const params = [];
  if (status) { where += ' AND a.status=?'; params.push(status); }
  if (q) { where += ' AND (a.title LIKE ? OR a.excerpt LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  const total = db.prepare(`SELECT COUNT(*) as c FROM articles a WHERE ${where}`).get(...params).c;
  const articles = db.prepare(`
    SELECT a.*, c.name as category_name FROM articles a LEFT JOIN categories c ON a.category_id=c.id
    WHERE ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, perPage, offset);
  res.render('admin/articles', { title: '文章管理', admin: req.session.admin, articles, page, totalPages: Math.ceil(total / perPage), status, q, blogName: getSetting('blog_name'), dayjs });
});

router.get('/articles/new', auth, (req, res) => {
  const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  const tags = db.prepare('SELECT * FROM tags ORDER BY name').all();
  res.render('admin/article-edit', { title: '新建文章', admin: req.session.admin, article: null, categories, tags, selectedTags: [], blogName: getSetting('blog_name') });
});

router.post('/articles/new', auth, upload.single('cover_image'), (req, res) => {
  const { title, content, excerpt, category_id, status, tags } = req.body;
  let slug = slugify(title) || `article-${Date.now()}`;
  const existing = db.prepare('SELECT id FROM articles WHERE slug=?').get(slug);
  if (existing) slug = slug + '-' + Date.now();
  const cover = req.file ? '/uploads/' + req.file.filename : null;
  const result = db.prepare('INSERT INTO articles(title,slug,content,excerpt,cover_image,category_id,status) VALUES(?,?,?,?,?,?,?)').run(
    title, slug, content, excerpt || content.slice(0, 200), cover, category_id || null, status || 'draft'
  );
  if (tags) {
    const tagList = Array.isArray(tags) ? tags : [tags];
    for (const tagName of tagList) {
      let tag = db.prepare('SELECT id FROM tags WHERE name=?').get(tagName);
      if (!tag) { const r = db.prepare('INSERT INTO tags(name,slug) VALUES(?,?)').run(tagName, slugify(tagName)); tag = { id: r.lastInsertRowid }; }
      db.prepare('INSERT OR IGNORE INTO article_tags(article_id,tag_id) VALUES(?,?)').run(result.lastInsertRowid, tag.id);
    }
  }
  res.redirect('/admin/articles');
});

router.get('/articles/:id/edit', auth, (req, res) => {
  const article = db.prepare('SELECT * FROM articles WHERE id=?').get(req.params.id);
  if (!article) return res.redirect('/admin/articles');
  const categories = db.prepare('SELECT * FROM categories ORDER BY name').all();
  const tags = db.prepare('SELECT * FROM tags ORDER BY name').all();
  const selectedTags = db.prepare('SELECT t.name FROM tags t JOIN article_tags at ON t.id=at.tag_id WHERE at.article_id=?').all(article.id).map(t => t.name);
  res.render('admin/article-edit', { title: '编辑文章', admin: req.session.admin, article, categories, tags, selectedTags, blogName: getSetting('blog_name') });
});

router.post('/articles/:id/edit', auth, upload.single('cover_image'), (req, res) => {
  const { title, content, excerpt, category_id, status, tags } = req.body;
  const cover = req.file ? '/uploads/' + req.file.filename : undefined;
  const updateFields = cover
    ? 'title=?,content=?,excerpt=?,cover_image=?,category_id=?,status=?,updated_at=CURRENT_TIMESTAMP'
    : 'title=?,content=?,excerpt=?,category_id=?,status=?,updated_at=CURRENT_TIMESTAMP';
  const params = cover
    ? [title, content, excerpt || content.slice(0, 200), cover, category_id || null, status || 'draft', req.params.id]
    : [title, content, excerpt || content.slice(0, 200), category_id || null, status || 'draft', req.params.id];
  db.prepare(`UPDATE articles SET ${updateFields} WHERE id=?`).run(...params);
  db.prepare('DELETE FROM article_tags WHERE article_id=?').run(req.params.id);
  if (tags) {
    const tagList = Array.isArray(tags) ? tags : [tags];
    for (const tagName of tagList) {
      let tag = db.prepare('SELECT id FROM tags WHERE name=?').get(tagName);
      if (!tag) { const r = db.prepare('INSERT INTO tags(name,slug) VALUES(?,?)').run(tagName, slugify(tagName)); tag = { id: r.lastInsertRowid }; }
      db.prepare('INSERT OR IGNORE INTO article_tags(article_id,tag_id) VALUES(?,?)').run(req.params.id, tag.id);
    }
  }
  res.redirect('/admin/articles');
});

router.post('/articles/:id/delete', auth, (req, res) => {
  db.prepare('DELETE FROM articles WHERE id=?').run(req.params.id);
  res.redirect('/admin/articles');
});

// ---- 评论管理 ----
router.get('/comments', auth, (req, res) => {
  const status = req.query.status || 'pending';
  const comments = db.prepare(`
    SELECT c.*, a.title as article_title, a.slug as article_slug
    FROM comments c JOIN articles a ON c.article_id=a.id
    WHERE c.status=? ORDER BY c.created_at DESC
  `).all(status);
  const counts = {
    pending: db.prepare("SELECT COUNT(*) as c FROM comments WHERE status='pending'").get().c,
    approved: db.prepare("SELECT COUNT(*) as c FROM comments WHERE status='approved'").get().c,
    spam: db.prepare("SELECT COUNT(*) as c FROM comments WHERE status='spam'").get().c,
  };
  res.render('admin/comments', { title: '评论管理', admin: req.session.admin, comments, status, counts, blogName: getSetting('blog_name'), dayjs });
});

router.post('/comments/:id/approve', auth, (req, res) => {
  db.prepare("UPDATE comments SET status='approved' WHERE id=?").run(req.params.id);
  res.redirect('/admin/comments?status=pending');
});

router.post('/comments/:id/spam', auth, (req, res) => {
  db.prepare("UPDATE comments SET status='spam' WHERE id=?").run(req.params.id);
  res.redirect(req.headers.referer || '/admin/comments');
});

router.post('/comments/:id/delete', auth, (req, res) => {
  db.prepare('DELETE FROM comments WHERE id=?').run(req.params.id);
  res.redirect(req.headers.referer || '/admin/comments');
});

// ---- 分类管理 ----
router.get('/categories', auth, (req, res) => {
  const categories = db.prepare('SELECT c.*, COUNT(a.id) as article_count FROM categories c LEFT JOIN articles a ON a.category_id=c.id GROUP BY c.id ORDER BY c.sort_order ASC, c.id ASC').all();
  res.render('admin/categories', { title: '分类管理', admin: req.session.admin, categories, blogName: getSetting('blog_name') });
});


router.post('/categories/reorder', auth, (req, res) => {
  const { orders } = req.body;
  if (!Array.isArray(orders)) return res.json({ success: false });
  const update = db.prepare('UPDATE categories SET sort_order=? WHERE id=?');
  const txn = db.transaction((items) => {
    items.forEach(({ id, order }) => update.run(order, id));
  });
  txn(orders);
  res.json({ success: true });
});
router.post('/categories/new', auth, (req, res) => {
  const { name, description } = req.body;
  db.prepare('INSERT OR IGNORE INTO categories(name,slug,description) VALUES(?,?,?)').run(name, slugify(name), description || '');
  res.redirect('/admin/categories');
});

router.post('/categories/:id/delete', auth, (req, res) => {
  db.prepare('UPDATE articles SET category_id=NULL WHERE category_id=?').run(req.params.id);
  db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
  res.redirect('/admin/categories');
});

// ---- 图片上传 API ----
router.post('/upload', auth, upload.single('image'), (req, res) => {
  if (!req.file) return res.json({ success: false, message: '上传失败' });
  res.json({ success: true, url: '/uploads/' + req.file.filename });
});

// ---- 博客设置 ----
router.get('/settings', auth, (req, res) => {
  const settings = {};
  db.prepare('SELECT * FROM settings').all().forEach(r => settings[r.key] = r.value);
  res.render('admin/settings', { title: '博客设置', admin: req.session.admin, settings, blogName: settings.blog_name, saved: req.query.saved, error: null });
});

router.post('/settings', auth, (req, res) => {
  const keys = ['blog_name','blog_description','blog_author','blog_keywords','posts_per_page','comment_moderation','icp_number','footer_text','about_content'];
  const update = db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)');
  for (const key of keys) if (req.body[key] !== undefined) update.run(key, req.body[key]);
  res.redirect('/admin/settings?saved=1');
});

router.post('/settings/password', auth, (req, res) => {
  const { old_password, new_password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE id=?').get(req.session.admin.id);
  if (!bcrypt.compareSync(old_password, admin.password)) {
    const settings = {};
    db.prepare('SELECT * FROM settings').all().forEach(r => settings[r.key] = r.value);
    return res.render('admin/settings', { title: '博客设置', admin: req.session.admin, settings, blogName: settings.blog_name, saved: null, error: '原密码错误' });
  }
  db.prepare('UPDATE admins SET password=? WHERE id=?').run(bcrypt.hashSync(new_password, 12), req.session.admin.id);
  res.redirect('/admin/settings?saved=1');
});

module.exports = router;
