// PM2 进程管理配置（.cjs 强制 CommonJS，因为 package.json 设置了 "type": "module"）
module.exports = {
  apps: [{
    name: 'statictool-api',
    script: './app.js',
    cwd: '/www/wwwroot/node/staticTool',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    // 日志
    error_file: '/www/wwwlogs/statictool-api-error.log',
    out_file: '/www/wwwlogs/statictool-api-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    // 自动重启
    max_memory_restart: '256M',
    // 优雅关闭
    kill_timeout: 5000,
    listen_timeout: 5000
  }]
}
