# AGENTS.md

## Role

You are the 0identity engineering agent. You build small, safe, complete changes for a browser-session assessment product.

## Skills

- Use the Cloudflare skill before work on Workers, Durable Objects, the Agents SDK, Wrangler, bindings, or Cloudflare configuration.
- Use the Durable Objects skill before changes to SQLite storage, RPC methods, migrations, or object lifetime.
- Use the Workers best-practices skill before changes to Worker request flow, bindings, logging, secrets, or observability.
- Use the Agents SDK skill before changes to the investigation agent.
- Use the Wrangler skill before Wrangler commands or Wrangler configuration changes.
- Use GSAP skills for animation work.
- Use the GSAP React skill for React animation setup and cleanup.

## Code organization

- Give each domain concern its own small directory or module.
- Keep browser collection, request handling, scoring, continuity matching, storage, agent tools, simulation, and user interface code separate.
- Keep business rules independent from Cloudflare runtime code.
- Put shared contracts in a location that both browser and Worker code can use.
- Keep tests close to the behavior they test. Use deterministic fixtures and test helpers.
- Keep user interface components small. Put page flow, state helpers, and styles in separate files when this improves clarity.

## Writing Code

- Start with a failing test for each new rule or bug fix when practical.
- Make the smallest code change that passes the test, then improve the design without changing behavior.
- Add or update focused tests for behavior changes.
- Test normal cases, boundary values, invalid input, and failure paths.
- Before you finish, run the type check, tests, and build.

## Technical design

### Human likelihood

- Use fixed, documented rules for the first scoring system.
- Do not use Workers AI as a scoring method.
- Return a human score and a separate confidence value.
- Score behavior, environment consistency, device data, network context, and history only when evidence is present.
- Use named values for score weights, limits, and thresholds.
- Reduce confidence when there is little data. Do not treat little data as automation by itself.
- Return clear component results and flags that explain a low score or a low confidence value.
- Check for conflicting browser, platform, header, API, rendering, and touch signals.

### Subject continuity

- Use multiple evidence groups: behavior, device, network, and session context.
- Do not use one browser hash as an anonymous subject identifier.
- Support matched, uncertain, and new results.
- Do not force a session to match an existing subject.
- Keep changed-device matches conservative.
- Treat a changed network as weaker evidence than stable behavior or device evidence.
- Store evolving subject profiles that can change over time.
- Do not update a subject profile from an uncertain result.

### Storage

- Store sessions, assessments, subject profiles, links, scores, flags, and derived evidence in SQLite-backed Durable Objects.
- Use server-selected, fixed, separate Durable Object names for live and simulated data. Never accept an object name from a client.
- Keep writes that match, link, and update one subject in one storage transaction.

## Safety and quality

- Treat all external input as untrusted. Validate it with Zod and enforce payload, text, array, and query limits.
- Create identifiers and add network or request data at the Worker. Never accept these server-derived values from a request body.
- Use parameterized SQL. Do not use dynamic code execution or user-controlled SQL.
- Do not use the any type.
- Do not log secrets, cookies, authorization headers, raw IP addresses, raw typed text, or event streams.
- Use clear names, strict types, small modules, and comments that explain a reason or a limit.
- Keep public API behavior stable unless a task requires a change.
- Record an important architecture decision in this file when later work needs it for safety or correctness.
