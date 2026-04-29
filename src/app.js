'use strict';
try { require('dotenv').config(); } catch(e) {}
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { init } = require('./database');

init();

const app = express();
app.set('trust proxy', 1);  // 信任 Nginx 转发的 X-Forwarded-For
const PORT = process.env.PORT || 3000;

// 安全 & 性能中间件
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'magies-blog-secret-2024-xK9mP',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 86400000, httpOnly: true }
}));

// 限流
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, skip: (req) => req.path.startsWith("/admin") });
app.use(limiter);
const commentLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });

// 静态文件 & 模板
app.use(express.static(path.join(__dirname, '../public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// 路由
const publicRouter = require('./routes/public');
const adminRouter = require('./routes/admin');
const apiRouter = require('./routes/api');

app.use('/', publicRouter);
app.use('/admin', adminRouter);
app.use('/api', commentLimiter, apiRouter);

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: '页面未找到' });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('500', { title: '服务器错误' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`✓ Magies Blog 运行于 http://127.0.0.1:${PORT}`);
});
