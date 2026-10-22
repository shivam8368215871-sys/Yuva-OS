# Yuva OS Hive

**Yuva OS Hive** is a browser-based desktop environment designed to bring an operating-system-inspired experience to the web. It combines a desktop interface, movable application windows, a dock, an app launcher, and a collection of built-in tools with a Node.js backend.

> **Project status:** Development project. Features and integrations may change as development continues. This repository is intended for local experimentation and development, not as a security-hardened public service.

## Features

### Desktop interface
- Desktop-style application windows and window management
- Application dock and searchable app launcher
- Context menus and desktop widgets
- Quick panel and configurable appearance
- Dark, glass-inspired interface styling

### Built-in applications
- Browser
- File manager
- Terminal
- Text editor
- Calculator
- Calendar and clock
- Notes
- Paint
- Tasks
- Settings
- Jupyter integration

The availability and behavior of individual features depend on the current implementation and local environment.

### Backend and services
- Node.js and Express server
- WebSocket-based terminal communication
- Docker-backed terminal and file operations
- PostgreSQL service configured through Docker Compose
- Jupyter integration hooks

## Technology stack

| Component | Technology |
| --- | --- |
| Frontend | HTML, CSS, JavaScript ES modules |
| Backend | Node.js, Express |
| Real-time communication | WebSockets (`ws`) |
| Containers | Docker and Docker Compose |
| Database service | PostgreSQL |
| Terminal interface | xterm.js |
| Development commands | Make |

## Project structure

```text
yuva/
├── backend/
│   ├── server.js
│   ├── auth.js
│   ├── fileManager.js
│   ├── jupyter.js
│   ├── package.json
│   └── Dockerfile
├── containers/
│   └── ubuntu/
│       └── Dockerfile
├── frontend/
│   ├── index.html
│   ├── theme.css
│   └── src/
│       ├── main.js
│       ├── auth.js
│       ├── core/
│       └── apps/
├── docker-compose.yml
├── Makefile
├── .env.example
└── README.md
```

## Requirements

- Linux or another environment that supports Docker
- Docker Engine
- Docker Compose plugin
- GNU Make
- A browser with modern JavaScript support
- Internet access when pulling container images or loading frontend assets from a CDN

## Run locally

1. Clone the repository and enter the project directory:

   ```bash
   git clone <YOUR-GITHUB-REPOSITORY-URL>
   cd yuva
   ```

2. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and supply your own configuration and credentials. Never commit `.env` or share API keys and passwords.

4. Review `docker-compose.yml` and the security notes below before starting the services. Ensure all database credentials are configured consistently and are suitable for local development.

5. Build and start the development environment:

   ```bash
   make dev
   ```

6. Open the desktop in your browser:

   **http://localhost:8080**

Stop the foreground development services with `Ctrl+C`. Use `docker compose down` from the project directory to stop the Compose services when appropriate.

## Configuration

The `.env.example` file documents the environment variables currently provided as a starting point:

| Variable | Purpose |
| --- | --- |
| `PORT` | Backend HTTP port; the application defaults to `8080` |
| `JUPYTER_PORT` | Port setting for Jupyter-related integration |
| `GEMINI_API_KEY` | Optional API key for integrations that use Gemini |

Use your own credentials where needed. Do not put real credentials in `.env.example`, source files, screenshots, issue reports, or commits.

Review the Docker Compose configuration as well: database settings must be consistent between the PostgreSQL service and backend.

## Security notes

**Use this project locally until its security model has been reviewed.**

- The backend mounts `/var/run/docker.sock`. Access to the Docker socket can grant powerful control over the host's Docker daemon and may lead to host-level impact.
- Do not expose the development server or Docker-backed terminal to an untrusted network.
- Review authentication, authorization, session handling, WebSocket access, file operations, and container isolation before deployment.
- Replace development credentials with strong, private values and keep secrets outside version control.
- Do not commit `.env`, database dumps, backups, local data, or generated credentials.
- Do not assume that authentication alone makes a Docker-enabled service safe for public access.

## Development

The root `Makefile` provides the main development target:

```bash
make dev
```

This builds the `yuva-ubuntu` container image and starts the Docker Compose development services.

Useful checks:

```bash
docker compose config --quiet
docker compose ps
docker compose logs --tail=100
```

Review the output of `docker compose config` carefully before sharing it, because resolved configuration can contain sensitive values.

## Contributing

Contributions and suggestions are welcome. Before opening a pull request:

1. Test changes in a local development environment.
2. Avoid committing credentials, backups, database dumps, or generated files.
3. Describe what changed and how it was tested.
4. Consider security implications for terminal, file-manager, and container operations.

## License

No license has been specified yet. Until a license is added, do not assume that others have permission to redistribute or modify this project. Add a suitable `LICENSE` file before publishing it as an openly licensed project.
