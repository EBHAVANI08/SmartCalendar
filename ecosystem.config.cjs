module.exports = {
  apps: [
    {
      name: "smart-calendar",
      script: "npm",
      args: "start",
      cwd: "./",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3005
      }
    }
  ]
};
