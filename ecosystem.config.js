'use strict';

// PM2 ecosystem file for msfg-docs on EC2, mounted at /docs/* behind CloudFront.
//
// Usage (on EC2):
//   cd /home/ubuntu/msfg-docs
//   pm2 start ecosystem.config.js --env production
//   pm2 save
//
// Secrets (COGNITO_*, GMAIL_*, etc.) must live in a sibling .env file — this
// config only sets non-secret routing/runtime values. See .env.example.

module.exports = {
  apps: [
    {
      name: 'msfg-docs',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
        PORT: 3005,
        BASE_PATH: '/docs'
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3004,
        BASE_PATH: ''
      }
    }
  ]
};
