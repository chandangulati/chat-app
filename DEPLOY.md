# Deploy Pulse Chat

This project is set up to deploy as one service, so you get one public link.

## Render

1. Push this project to GitHub.
2. Go to Render.
3. Create a new `Blueprint` deployment from your repository.
4. Render will detect `render.yaml`.
5. Deploy.

Your deployed app will:

- serve the React frontend from the backend
- expose the Socket.IO server from the same origin
- work with one public URL

## Local Note

For local development, the frontend still connects to `http://localhost:49152`.
In production, it automatically connects to the same origin that served the app.
