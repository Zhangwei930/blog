const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/blog.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      excerpt TEXT,
      cover_image TEXT,
      category_id INTEGER REFERENCES categories(id),
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','published')),
      views INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS article_tags (
      article_id INTEGER REFERENCES articles(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (article_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      author_name TEXT NOT NULL,
      author_email TEXT,
      author_website TEXT,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','spam')),
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
    CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
    CREATE INDEX IF NOT EXISTS idx_comments_article ON comments(article_id);
    CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);
  `);

  // 初始化默认分类
  const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
  if (catCount.c === 0) {
    db.prepare("INSERT INTO categories(name,slug,description) VALUES(?,?,?)").run('技术', 'tech', '技术分享');
    db.prepare("INSERT INTO categories(name,slug,description) VALUES(?,?,?)").run('生活', 'life', '生活随笔');
    db.prepare("INSERT INTO categories(name,slug,description) VALUES(?,?,?)").run('思考', 'thoughts', '深度思考');
  }

  // 初始化默认设置
  const defaults = {
    blog_name: 'Magies Blog',
    blog_description: '记录思考，分享生活',
    blog_author: 'Magies',
    blog_avatar: '/images/avatar.png',
    blog_keywords: 'blog,magies,技术,生活',
    posts_per_page: '10',
    comment_moderation: 'true',
    icp_number: '',
    footer_text: '© 2024 Magies Blog. All rights reserved.'
  };
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  for (const [k, v] of Object.entries(defaults)) insertSetting.run(k, v);

  // 初始化管理员账号
  const adminCount = db.prepare('SELECT COUNT(*) as c FROM admins').get();
  if (adminCount.c === 0) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASS || 'Magies@2024!', 12);
    db.prepare('INSERT INTO admins(username,password,email) VALUES(?,?,?)').run(
      process.env.ADMIN_USER || 'magies', hash, 'admin@magies.top'
    );
    console.log('✓ 默认管理员已创建');
  }

  // 创建示例文章
  const artCount = db.prepare('SELECT COUNT(*) as c FROM articles').get();
  if (artCount.c === 0) {
    db.prepare(`INSERT INTO articles(title,slug,content,excerpt,category_id,status) VALUES(?,?,?,?,?,?)`).run(
      '欢迎来到 Magies Blog！',
      'welcome-to-magies-blog',
      `# 欢迎来到 Magies Blog！\n\n这是我的个人博客，在这里我将记录技术探索、生活感悟和深度思考。\n\n## 关于博客\n\n- **技术分享**：记录学习过程中的心得体会\n- **生活随笔**：日常所见所闻\n- **深度思考**：对各类问题的思考与探索\n\n欢迎留言交流！`,
      '这是我的个人博客，欢迎来访！',
      1,
      'published'
    );
  }

  console.log('✓ 数据库初始化完成');
}

module.exports = { db, init };
