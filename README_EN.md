Seiya Yamachika — Personal Website

Personal portfolio and research website of Seiya Yamachika.

About

This repository contains the source code for my personal website.

The website serves not only as a portfolio for presenting my activities and projects, but also as a public platform for sharing research results and technical projects.

The website includes:

Research activities and results
Conference presentations and materials
Technical projects
Interactive web demonstrations
Press releases and research-related announcements
Profile and contact information
Research

My research and technical development focuses on areas including virtual reality, human-computer interaction, and four-dimensional geometry.

Research results and presentation materials are continuously published through the website.

Projects
4D Cube

A project focused on the visualization and projection of a four-dimensional cube (tesseract).

The project represents the cube using four-dimensional coordinates and explores rotations and transformations within four-dimensional space before projecting the result into lower-dimensional spaces.

The goal is to provide an interactive web-based visualization that allows users to explore the structure of four-dimensional geometry and observe how its appearance changes through projection.

Interactive demonstration:
https://yamachikaseiya.com/project/cube/3d-2d

Blog

This branch adds an authenticated editor for Blog posts and dated diary entries, anonymous likes, moderated comments and replies, optional email reply notifications, and X sharing using Cloudflare Pages Functions, D1, and R2. Authenticated author comments have an author badge. These features are under local verification and are not deployed to production. Earlier local drafts are not automatically migrated. See docs/BLOG_DYNAMIC.md for setup and security details.

Development

The website is primarily developed using:

HTML
CSS
JavaScript

Existing pages and demonstrations remain static. Blog APIs run on Cloudflare Pages Functions, with D1 for data and R2 for photos. Node.js 24 or later is used for development and testing.

Repository Structure

.
├── index.html
├── css/
├── js/
├── images/
├── project/
├── research/
├── contact/
└── en/

project/ — Technical projects
research/ — Research-related pages
contact/ — Contact information
en/ — English-language pages
css/ — Stylesheets
js/ — JavaScript
images/ — Images
Local Development

Clone the repository:

git clone https://github.com/AoneSenbongi/Website.git
cd Website

Run npm ci and npm run dev for the Blog preview. Preview emails stay in a local outbox and are never sent externally. The existing static pages can also be served with a static web server.

Open Source Projects

The website as a whole is developed as a personal portfolio and research publication platform.

At the same time, technical projects published within the website are developed with the goal of making their implementations publicly inspectable, usable, and extensible by others.

In particular, the 4D Cube project publicly provides implementations related to the visualization and projection of four-dimensional geometry.

Author

Seiya Yamachika

Website: https://yamachikaseiya.com/

GitHub: https://github.com/AoneSenbongi

The source code of this project is licensed under the MIT License. Unless otherwise stated, website content, images, research materials, and other non-code assets are not covered by this license.
