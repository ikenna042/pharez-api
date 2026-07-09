/**
 * PM2 Ecosystem Configuration for Production
 * 
 * This configuration file defines how PM2 should manage the Pharez API application.
 * Copy this to ecosystem.config.js in the project root.
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 restart ecosystem.config.js
 *   pm2 stop ecosystem.config.js
 *   pm2 logs pharez-api
 */

module.exports = {
  apps: [
    {
      // Application name (used in PM2 commands)
      name: 'pharez-api',

      // Entry point script
      script: './server.js',

      // Number of instances to run
      // Set to 'max' to use all CPU cores
      // Or set to a specific number (e.g., 2, 4)
      instances: 'max',

      // Execution mode: 'cluster' for multiple instances, 'fork' for single
      exec_mode: 'cluster',

      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },

      // Error log file location
      error_file: '/var/log/pharez-api/error.log',

      // Output/access log file location
      out_file: '/var/log/pharez-api/out.log',

      // Log date format
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Merge logs from all instances into one file
      merge_logs: true,

      // Watch files and auto-restart on changes (false for production)
      watch: false,

      // Ignore these patterns when watching for changes
      ignore_watch: [
        'node_modules',
        'logs',
        '.env',
        'coverage',
        'dist'
      ],

      // Maximum memory allowed per instance before restart (1GB)
      max_memory_restart: '1G',

      // Delay between restart attempts (milliseconds)
      restart_delay: 4000,

      // Time to wait for graceful shutdown (milliseconds)
      kill_timeout: 5000,

      // Time to wait for app to listen on port (milliseconds)
      listen_timeout: 10000,

      // Number of restart attempts before failing
      max_restarts: 10,

      // Time window for max_restarts (minutes)
      min_uptime: '10m',

      // Autorestart on crash
      autorestart: true,

      // Catch uncaught exceptions
      exp_backoff_restart_delay: 100
    },

    // Optional: Additional instance with different configuration
    // This can be used for background jobs or workers
    // Uncomment if needed:
    /*
    {
      name: 'pharez-api-worker',
      script: './server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        WORKER_MODE: 'true'
      },
      error_file: '/var/log/pharez-api/worker-error.log',
      out_file: '/var/log/pharez-api/worker-out.log',
      max_memory_restart: '500M'
    }
    */
  ],

  // Deployment configuration (optional)
  // Uncomment if using PM2 deploy feature
  /*
  deploy: {
    production: {
      user: 'node',
      host: 'your-server.com',
      ref: 'origin/main',
      repo: 'git@github.com:your-org/pharez-api.git',
      path: '/opt/pharez-api',
      'post-deploy': 'npm install --production && npm run migrate && pm2 restart ecosystem.config.js'
    }
  }
  */
};

/**
 * Quick Reference - Common PM2 Commands:
 * 
 * Start:
 *   pm2 start ecosystem.config.js
 * 
 * Stop:
 *   pm2 stop pharez-api
 * 
 * Restart:
 *   pm2 restart pharez-api
 * 
 * Reload (graceful restart):
 *   pm2 reload pharez-api
 * 
 * Delete:
 *   pm2 delete pharez-api
 * 
 * View status:
 *   pm2 status
 * 
 * View logs:
 *   pm2 logs pharez-api
 * 
 * Monitor:
 *   pm2 monit
 * 
 * Save state:
 *   pm2 save
 * 
 * Resurrect (restore saved state):
 *   pm2 resurrect
 * 
 * Startup (auto-start on boot):
 *   pm2 startup
 *   pm2 save
 * 
 * Remove startup:
 *   pm2 unstartup
 */
