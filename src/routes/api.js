const express = require('express');
const router = express.Router();
const { db } = require('../database');
const sanitizeHtml = require('sanitize-html');

router.post('/comment', (req, res) => {
  const { article_id, author_name, author_email, author_website, content } = req.body;
  if (!article_id || !author_name || !content) {
    return res.json({ success: false, message: '请填写必要信息' });
  }
  if (content.length < 5 || content.length > 1000) {
    return res.json({ success: false, message: '评论内容长度需在 5-1000 字之间' });
  }
  const article = db.prepare('SELECT id FROM articles WHERE id=? AND status=?').get(article_id, 'published');
  if (!article) return res.json({ success: false, message: '文章不存在' });

  const moderation = db.prepare('SELECT value FROM settings WHERE key=?').get('comment_moderation');
  const needReview = !moderation || moderation.value === 'true';
  const status = needReview ? 'pending' : 'approved';
  const cleanContent = sanitizeHtml(content, { allowedTags: [], allowedAttributes: {} });
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  db.prepare('INSERT INTO comments(article_id,author_name,author_email,author_website,content,status,ip_address) VALUES(?,?,?,?,?,?,?)')
    .run(article_id, author_name.slice(0,50), (author_email||'').slice(0,100), (author_website||'').slice(0,200), cleanContent, status, (ip||'').slice(0,50));

  res.json({ success: true, message: needReview ? '评论已提交，待审核后显示' : '评论发布成功！', status });
});

module.exports = router;
