module.exports = {
  apps: [
    {
      name: 'algorithm-review-backend',
      script: 'npm',
      args: 'run start:backend',
      cwd: __dirname,
      out_file: './logs/backend.out.log',
      error_file: './logs/backend.error.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'algorithm-review-frontend',
      script: 'npm',
      args: 'run start:frontend',
      cwd: __dirname,
      out_file: './logs/frontend.out.log',
      error_file: './logs/frontend.error.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
