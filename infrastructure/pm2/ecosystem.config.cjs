module.exports = {
  apps: [
    {
      name: "mashuphost-api",
      script: "pnpm",
      args: "start:api",
      env: {
        NODE_ENV: "production",
        PORT: 4000
      }
    },
    {
      name: "mashuphost-web",
      script: "pnpm",
      args: "start:web",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    },
    {
      name: "mashuphost-worker",
      script: "pnpm",
      args: "start:worker",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
