# Core rules

This repo is public. Never commit confidential material or content copied from private repos.

## UI components

Use shadcn/ui components from `src/components/ui` for interface controls and
patterns, including inputs, selects, buttons, labels, field groups and toggles.
Add missing components with the shadcn CLI using the existing `components.json`
configuration. Compose those components for product UI; keep semantic HTML for
page structure and content where no shadcn component applies.

## Forms and state

Build forms with TanStack Form through `useAppForm` in
`src/components/forms/app-form.tsx`. Compose `form.AppField` controls and
`form.AppForm` / `form.SubmitButton`; extend the shared fields when needed.
Keep field values, validation, errors, dirty state and submission state in the
form, using Zod schemas and `form.Subscribe` for derived UI. Reset through the
form API. Use `useState` only for independent UI or request state, such as a
confirmation dialog or autocomplete query; do not mirror form state in it.
