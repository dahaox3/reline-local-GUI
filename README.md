# Reline Local GUI

---

<div align="center">
  <img src="preview.png" alt="Preview">
</div>

## EN

## Description

> **Reline Local GUI** is the offline version of [configurator.yor.ovh](https://configurator.yor.ovh), allowing you to generate and instantly run a config file in a local environment.

This fork also adds a local API workflow for use with ComicRead and other clients:

- Start a Reline HTTP API service directly from the GUI.
- Apply the current node graph to the running API service without restarting the app.
- Use `dynamic` reader mode so mixed gray/color image folders can keep their original channel format.
- Configure automatic color detection in the upscale node, with separate gray/color models and optional high-memory model caching.
- Add `API Output` and `API Snapshot` nodes for API responses and local snapshot copies.
- Mark `level` and `screentone` nodes to skip color pages when automatic color detection is enabled.
- Download/manage models and Reline dependencies from the GUI.

Default API address:

```text
http://127.0.0.1:5678
```

Useful endpoints:

- `GET /status`
- `GET /models`
- `POST /reload`
- `POST /upscale`

---

## Releases

Prebuilt packages are published on the GitHub Releases page:

https://github.com/dahaox3/reline-local-GUI/releases

Download the archive for your platform, extract it, and run `reline-local-gui`.

---

## Building
Clone this repo, then install the dependencies with<br>
```npm install``` <br>

To launch it, run:<br>
```npm run go``` <br>

To build it run: <br>
```npm run dist``` for Windows<br>
```npm run distlin``` for Linux<br>

The packaged app is written to the `release/` directory.

---

## RU

## Описание

> **Reline Local GUI** — это оффлайн-версия [configurator.yor.ovh](https://configurator.yor.ovh), которая позволяет создавать конфиги и сразу запускать их выполнение в локальной среде.

---

## Сборка

Склонируйте репозиторий, затем установите зависимости через:<br>
```npm install``` <br>

Для запуска, выполните:<br>
```npm run go```<br>

Для сборки выполните: <br>
```npm run dist``` для Windows<br>
```npm run distlin``` для Linux<br>


