# Security

## Supported versions

Fixes go into the latest 0.x release only.

## Reporting a vulnerability

Please report it privately through GitHub: on the repository's **Security** tab, choose
**Report a vulnerability**. Don't open a public issue for it.

Say what you ran (the input, options and version), what happened and what you expected. You'll get
a reply on the report; once a fix is released, the advisory is published with it.

## Scope

td;dr compiles HTML you give it; it doesn't sanitize untrusted HTML, and its output is only as safe
as its input. Reports that matter most:

- a compile, check or build that runs code, reads or writes files outside what it was asked to, or
  fetches from the network;
- the dev server (`tddr dev`) serving files outside the folder it was started on, or accepting a
  request from another origin;
- input that makes a compile hang or use memory out of proportion to its size.
