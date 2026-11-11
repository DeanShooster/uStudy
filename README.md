# uStudy

uStudy is a one-on-one AI tutor. Pick a topic, then learn by voice or text while it teaches, quizzes you, and follows your work on the board.

The model is part of the lesson. Each turn it teaches one idea, reads the board, and moves the session forward.

[![uStudy showcase](https://img.youtube.com/vi/69RvhCVrxF8/maxresdefault.jpg)](https://youtu.be/69RvhCVrxF8)

This repo has three projects. Run the client with either server. Both servers listen on port 4000, so start only one of them.

| Project | Folder | Stack |
| --- | --- | --- |
| Client | `Client` | React, Vite, TypeScript |
| Node.js API | `NodeJS Server` | Express, MongoDB |
| .NET API | `.NET Server` | ASP.NET Core, MongoDB |

The client runs at http://localhost:3000 and calls the API at http://localhost:4000.

## Client

```bash
cd Client
npm install
npm run dev
```

## Node.js server

```bash
cd "NodeJS Server"
copy .env.example .env
npm install
npm run dev
```

Fill in `.env` before the first run. `DB_KEY_NAME` is the MongoDB connection string. `SECRET` signs login tokens. `OPENAI_API_KEY` is the tutor key. `OPENAI_BASE_URL` and `OPENAI_MODEL` point the tutor at the model you want. `OPENAI_TTS_MODEL` and `OPENAI_TTS_VOICE` are optional. Set `VOICE_PROVIDER=local` to use the local voice path.

## .NET server

```bash
cd ".NET Server/uStudy Server"
copy appsettings.example.json appsettings.json
dotnet run
```

Use the same keys in `appsettings.json`: `DB_KEY_NAME`, `SECRET`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_TTS_MODEL`, and `OPENAI_TTS_VOICE`.

Swagger is at http://localhost:4000/swagger.

`appsettings.json` and `.env` stay on your machine. Do not commit them.
