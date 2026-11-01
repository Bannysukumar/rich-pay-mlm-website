/** PM2 process file for aaPanel — keeps port + Node 22 stable across restarts. */
module.exports = {
  apps: [
    {
      name: 'richpay',
      script: 'server.mjs',
      cwd: '/www/wwwroot/richpay.live',
      interpreter: '/www/server/nodejs/v22.19.0/bin/node',
      instances: 1,
      exec_mode: 'fork',
      env: {
        PORT: 4173,
        NODE_ENV: 'production',
        VITE_FIREBASE_PROJECT_ID: 'richpay-live-fe3f1',
        VITE_FIREBASE_FUNCTIONS_REGION: 'us-central1',
      },
    },
  ],
}
