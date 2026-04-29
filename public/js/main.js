// 提交评论
async function submitComment(articleId) {
  const name = document.getElementById('c-name').value.trim();
  const email = document.getElementById('c-email').value.trim();
  const content = document.getElementById('c-content').value.trim();
  const msgEl = document.getElementById('comment-msg');
  if (!name || !content) { showMsg('请填写昵称和评论内容', 'error'); return; }
  if (content.length < 5) { showMsg('评论内容至少 5 个字', 'error'); return; }
  const btn = document.querySelector('.comment-form .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '提交中...'; }
  try {
    const res = await fetch('/api/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article_id: articleId, author_name: name, author_email: email, content })
    });
    const data = await res.json();
    if (data.success) {
      showMsg(data.message, 'success');
      document.getElementById('c-name').value = '';
      document.getElementById('c-email').value = '';
      document.getElementById('c-content').value = '';
    } else {
      showMsg(data.message || '提交失败，请重试', 'error');
    }
  } catch(e) { showMsg('网络错误，请重试', 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '提交评论'; } }
}

function showMsg(msg, type) {
  const el = document.getElementById('comment-msg');
  if (!el) return;
  el.textContent = msg;
  el.className = 'alert alert-' + (type === 'error' ? 'error' : 'success');
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 4000);
}

// 代码块复制
document.querySelectorAll('pre').forEach(pre => {
  const btn = document.createElement('button');
  btn.textContent = '复制';
  btn.style.cssText = 'position:absolute;top:8px;right:8px;padding:4px 10px;background:#fff2;border:1px solid #fff3;border-radius:4px;color:#fff;cursor:pointer;font-size:12px;';
  pre.style.position = 'relative';
  pre.appendChild(btn);
  btn.onclick = () => {
    navigator.clipboard.writeText(pre.querySelector('code')?.textContent || pre.textContent);
    btn.textContent = '已复制！';
    setTimeout(() => btn.textContent = '复制', 2000);
  };
});
