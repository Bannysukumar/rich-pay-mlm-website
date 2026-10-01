# Rich Pay Clone

Production-oriented scaffold for a crypto investment and referral (MLM-style) platform: React (Vite) + Tailwind + Firebase (Auth, Firestore, Storage, Functions, Hosting). UI follows a premium black and gold institutional theme with a dashboard sidebar aligned to the specification you provided.

[![License](https://img.shields.io/github/license/Bannysukumar/rich-pay-mlm-website)](https://github.com/Bannysukumar/rich-pay-mlm-website/blob/main/LICENSE) [![Stars](https://img.shields.io/github/stars/Bannysukumar/rich-pay-mlm-website)](https://github.com/Bannysukumar/rich-pay-mlm-website/stargazers) [![Last commit](https://img.shields.io/github/last-commit/Bannysukumar/rich-pay-mlm-website)](https://github.com/Bannysukumar/rich-pay-mlm-website/commits/main)

## Overview

Production-oriented scaffold for a crypto investment and referral (MLM-style) platform: React (Vite) + Tailwind + Firebase (Auth, Firestore, Storage, Functions, Hosting). UI follows a premium black and gold institutional theme with a dashboard sidebar aligned to the specification you provided.


What is actually in the repository: `functions/`, `public/`, `scripts/`, `src/`. GitHub reports the primary language as TypeScript.

## Features


- Admin Audit Page
- Admin Bulk Wallet Transfer Page
- Admin Cms Page
- Admin Deposits Page
- Admin Home
- Admin Income Ledgers Hub Page
- Admin Maintenance Page
- Admin Member Balance Adjust Page
- Admin Member Contact Page
- Admin Member Investment Plans Page
- Admin Notifications Page
- Admin Package Activation Split Page

## Tech Stack

| Technology | Where it shows up |
|---|---|
| React | User interface |
| Vite | Frontend build tool |
| Firebase | Backend services used by this repository |
| Tailwind CSS | Styling |
| Recharts | Charts |

## Project Architecture

React interface built with Vite → Firebase project files (firestore rules, hosting, or functions) checked into this repository.

## Project Structure

```text
rich-pay-mlm-website/
├── functions/
├── public/
├── scripts/
├── src/
├── .env.example
├── .firebaserc
├── .firebaserc.example
├── COMPENSATION_PLAN_AUDIT.md
├── eslint.config.js
├── firebase.json
├── firestore.indexes.json
├── firestore.rules
├── index.html
├── package-lock.json
├── package.json
├── storage.rules
```

## Getting Started

```bash
git clone https://github.com/Bannysukumar/rich-pay-mlm-website.git
cd rich-pay-mlm-website
npm install
npm run dev
# Copy .env.example to .env and fill in the values that file lists.
```

Scripts defined in package.json:

- `npm run dev` — `vite`
- `npm run build` — `tsc -b && vite build`
- `npm run lint` — `eslint .`
- `npm run deploy:hosting+functions` — `firebase deploy --only "hosting,functions"`

## Deployment

- firebase.json is in the repository root.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

Licensed under MIT. See [LICENSE](LICENSE).

## Author

[Banny Sukumar](https://github.com/Bannysukumar)

- GitHub: [@Bannysukumar](https://github.com/Bannysukumar)
- Portfolio: [adepu-sukumar.vercel.app](https://adepu-sukumar.vercel.app/)
- LinkedIn: [Adepu Sukumar](https://www.linkedin.com/in/adepu-sukumar-59b423351)
