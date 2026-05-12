const express = require('express');
const router  = require('express').Router();
const { db }  = require('../database');
const { marked } = require('marked');
const dayjs   = require('dayjs');

const PUB = 'published';

function extractFirstImage(content) {
  const m = content && content.match(/!\[.*?\]\((https?:\/\/[^\)]+)\)/);
  return m ? m[1] : null;
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : '';
}

function getBaseData() {
  return {
    blogName:      getSetting('blog_name'),
    blogDesc:      getSetting('blog_description'),
    blogAuthor:    getSetting('blog_author'),
    blogAvatar:    getSetting('blog_avatar'),
    footerText:    getSetting('footer_text'),
    icpNumber:     getSetting('icp_number'),
    categories:    db.prepare('SELECT c.*, COUNT(a.id) as article_count FROM categories c LEFT JOIN articles a ON a.category_id=c.id AND a.status=? GROUP BY c.id ORDER BY c.sort_order ASC, c.id ASC').all(PUB),
    recentArticles: db.prepare('SELECT id,title,slug,created_at FROM articles WHERE status=? ORDER BY created_at DESC LIMIT 5').all(PUB),
    dayjs
  };
}

// 首页（知识库风格）
router.get('/', (req, res, next) => {
  try {
    const base = getBaseData();
    const totalArticles = db.prepare('SELECT COUNT(*) as c FROM articles WHERE status=?').get(PUB).c;
    const totalViews    = db.prepare('SELECT SUM(views) as v FROM articles WHERE status=?').get(PUB).v || 0;
    const cats = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, id ASC').all();
    const categoryGroups = cats.map(cat => {
      const arts = db.prepare(
        'SELECT id,title,slug,views FROM articles WHERE category_id=? AND status=? ORDER BY created_at DESC LIMIT 8'
      ).all(cat.id, PUB);
      const total = db.prepare('SELECT COUNT(*) as c FROM articles WHERE category_id=? AND status=?').get(cat.id, PUB).c;
      return Object.assign({}, cat, { articles: arts, total: total });
    });
    const latestArticles = db.prepare(
      'SELECT a.*, c.name as category_name FROM articles a ' +
      'LEFT JOIN categories c ON a.category_id=c.id ' +
      'WHERE a.status=? ORDER BY a.created_at DESC LIMIT 6'
    ).all(PUB).map(a => Object.assign({}, a, {
      cover_image: a.cover_image || extractFirstImage(a.content)
    }));
    res.render('index', Object.assign({}, base, {
      categoryGroups: categoryGroups,
      latestArticles: latestArticles,
      totalArticles:  totalArticles,
      totalViews:     totalViews,
      category: null,
      articles: [],
      page: 1,
      totalPages: 1,
      title: ''
    }));
  } catch(e) { next(e); }
});

// 文章详情
router.get('/article/:slug', (req, res, next) => {
  try {
    const article = db.prepare(
      'SELECT a.*, c.name as category_name, c.slug as category_slug ' +
      'FROM articles a LEFT JOIN categories c ON a.category_id=c.id ' +
      'WHERE a.slug=? AND a.status=?'
    ).get(req.params.slug, PUB);
    if (!article) return res.status(404).render('404', { title: '文章未找到' });
    db.prepare('UPDATE articles SET views=views+1 WHERE id=?').run(article.id);
    article.content_html = marked.parse(article.content);
    const comments = db.prepare('SELECT * FROM comments WHERE article_id=? AND status=? ORDER BY created_at ASC').all(article.id, 'approved');
    const tags     = db.prepare('SELECT t.* FROM tags t JOIN article_tags at ON t.id=at.tag_id WHERE at.article_id=?').all(article.id);
    const prev     = db.prepare('SELECT id,title,slug FROM articles WHERE status=? AND id<? ORDER BY id DESC LIMIT 1').get(PUB, article.id);
    const nxt      = db.prepare('SELECT id,title,slug FROM articles WHERE status=? AND id>? ORDER BY id ASC LIMIT 1').get(PUB, article.id);
    res.render('article', Object.assign({}, getBaseData(), {
      article: article,
      comments: comments,
      tags: tags,
      prev: prev,
      next: nxt,
      title: article.title,
      commentModeration: getSetting('comment_moderation') === 'true'
    }));
  } catch(e) { next(e); }
});

// 分类页
router.get('/category/:slug', (req, res, next) => {
  try {
    const page    = parseInt(req.query.page) || 1;
    const perPage = parseInt(getSetting('posts_per_page')) || 10;
    const offset  = (page - 1) * perPage;
    const category = db.prepare('SELECT * FROM categories WHERE slug=?').get(req.params.slug);
    if (!category) return res.status(404).render('404', { title: '分类未找到' });
    const total    = db.prepare('SELECT COUNT(*) as c FROM articles WHERE category_id=? AND status=?').get(category.id, PUB).c;
    const articles = db.prepare(
      'SELECT a.*, c.name as category_name, c.slug as category_slug ' +
      'FROM articles a LEFT JOIN categories c ON a.category_id=c.id ' +
      'WHERE a.category_id=? AND a.status=? ORDER BY a.created_at DESC LIMIT ? OFFSET ?'
    ).all(category.id, PUB, perPage, offset);
    res.render('index', Object.assign({}, getBaseData(), {
      articles: articles,
      page: page,
      totalPages: Math.ceil(total / perPage),
      category: category,
      categoryGroups: [],
      latestArticles: [],
      totalArticles: total,
      totalViews: 0,
      tag: null,
      title: category.name
    }));
  } catch(e) { next(e); }
});

// 归档
router.get('/archive', (req, res, next) => {
  try {
    const articles = db.prepare('SELECT id,title,slug,created_at FROM articles WHERE status=? ORDER BY created_at DESC').all(PUB);
    const grouped  = {};
    articles.forEach(function(a) {
      const year = dayjs(a.created_at).format('YYYY');
      if (!grouped[year]) grouped[year] = [];
      grouped[year].push(a);
    });
    res.render('archive', Object.assign({}, getBaseData(), { grouped: grouped, title: '文章归档' }));
  } catch(e) { next(e); }
});

// 关于
router.get('/about', (req, res, next) => {
  try {
    res.render('about', Object.assign({}, getBaseData(), {
      title: '关于我',
      aboutContent: getSetting('about_content') || '# 关于我'
    }));
  } catch(e) { next(e); }
});

module.exports = router;
