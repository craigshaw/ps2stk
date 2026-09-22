# Cloudflare Pages deployment

Live site: [ps2stk.craigshaw.com](https://ps2stk.craigshaw.com).

Status: Cloudflare Pages deployment and custom-domain setup completed by the user on 2026-09-22. The user confirmed that the site is working. Milestone 4 release validation remains open.

## Deployment record

- The user selected the Cloudflare account that already manages `craigshaw.com`.
- The user completed the Pages Git setup for `craigshaw/ps2stk`, reported the build in progress, and then confirmed that the site was working after the custom-domain instructions.
- This is user-reported hosting evidence. The Cloudflare dashboard, build log, exact deployed commit, assigned `pages.dev` hostname, and browser version were not inspected or recorded.
- The settings below are the setup values supplied to the user. They have not been independently compared with the final dashboard configuration. GitHub branch protection and preview configuration remain unverified.

## Pages setup reference

The project is already deployed. For future setup, open **Workers & Pages → Create application** and select **Pages** before connecting GitHub. The Workers form has deploy-command and API-token fields; the Pages form has a build output directory. Grant the GitHub integration access to `craigshaw/ps2stk`.

The setup instructions used these settings:

| Setting | Value |
| --- | --- |
| Repository | `craigshaw/ps2stk` |
| Project name | `ps2stk`, subject to availability |
| Production branch | `main` |
| Root directory | Repository root |
| Framework preset | None, with the explicit settings below |
| Build command | `npm ci && npm run check` |
| Build output directory | `dist` |
| Build variable | `SKIP_DEPENDENCY_INSTALL=1` |
| Build variable | `NODE_VERSION=24` |
| Node.js version | 24, also selected by the existing `.nvmrc` |

Apply the build variable to production and preview builds. Remove any conflicting Node version override, or set `NODE_VERSION=24`. Keep development dependencies available during the build. The application needs no runtime secrets or server bindings.

The build command installs the lockfile versions, checks TypeScript, runs unit tests, and builds the static application. A failed command prevents that deployment. Browser regression tests are separate: run `npm run test:browser` before promoting application changes and enforce required checks on the production branch in GitHub.

Use Git integration from the start. Pushes to the production branch deploy production; eligible other branches provide previews. Do not create a Direct Upload project for this workflow. See [Cloudflare Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/).

Cloudflare supports `.nvmrc` and a custom dependency install command through `SKIP_DEPENDENCY_INSTALL`. See [build image configuration](https://developers.cloudflare.com/pages/configuration/build-image/).

## Domain setup reference

The user confirmed that Cloudflare manages `craigshaw.com` and reported the site working after setup. Retain these steps for future maintenance:

1. Complete the first deployment and check the actual `pages.dev` address assigned by Cloudflare. Do not assume that `ps2stk.pages.dev` is available.
2. In the Pages project, open **Custom domains**, select **Set up a custom domain**, and enter `ps2stk.craigshaw.com`.
3. If Cloudflare manages `craigshaw.com` in the selected account, review and confirm the DNS record offered by the setup flow.
4. If DNS is managed elsewhere, add a CNAME at that provider with name `ps2stk` and target equal to the assigned production `pages.dev` hostname.
5. Wait until the domain is active and HTTPS works, then run the hosted checks below.

Associate the hostname with the Pages project before adding a CNAME manually. A CNAME alone is insufficient. A subdomain does not require moving the whole domain's nameservers. See [Cloudflare custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).

## Static application behaviour

Vite writes the application and package codec worker to `dist`. Deploy that directory only. Card images and save contents remain in browser memory. Test fixtures and personal save assets must not enter the deployed files.

The current site has no top-level `404.html`, so Pages supplies its default SPA fallback. No custom rewrite is required. Start with the default Pages cache settings. See [serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/).

## Hosted verification

Local preparation on 2026-09-22: `npm ci` and `npm run check` passed using Node.js 24.21.0. All 129 unit/CLI tests passed, TypeScript checks passed, and Vite produced the static build. The build reported Lucide `use client` directive warnings and a 526 kB renderer chunk warning. Local Markdown links and the diff whitespace check passed. Browser tests were not rerun for these documentation changes.

The user's confirmation establishes that hosting is working. Detailed HTTPS, browser, and binary-output checks below remain pending; no specific card or package workflow was reported as tested.

- Open the custom HTTPS address and reload it. Check that scripts, styles, the codec worker, icon previews, and third-party notices load successfully.
- Open synthetic cards, copy a save, use Undo/Redo, and download the edited card. Compare its bytes with the expected result.
- Import and export save packages to exercise the worker on the deployed origin.
- Check individual downloads in supported desktop browsers. Check the native folder picker and a new-folder dump in installed Chrome and Edge over HTTPS.
- Check keyboard controls, reduced motion, and narrow desktop layouts. Confirm that opening and editing cards sends no card data over the network.
- Record the deployed commit, URLs, browser versions, results, and any failures before accepting hosted validation.

PCSX2, PS2 through MemCard PRO2, and PS3 destination tests remain pending as recorded in the existing [implementation plan](./implementation-plan.md) and [milestone 3C validation](./milestone-3c-validation.md). A successful web deployment is not evidence that these tests passed.
