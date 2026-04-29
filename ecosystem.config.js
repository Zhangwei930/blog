module.exports = {
  apps: [{
    name: 'magies-blog',
    script: './src/app.js',
    cwd: '/opt/magies-blog',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
      PORT: '3000'
    },
    error_file: '/opt/magies-blog/logs/error.log',
    out_file: '/opt/magies-blog/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }]
};
