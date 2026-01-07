// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --env=prod` then `environment.prod.ts` will be used instead.
// The list of which env maps to which file can be found in `.angular-cli.json`.

export const environment = {
  production: false,
  desktop: false,
  donationAddress:
    "nano_1nnym1fi87ogqqb48ezizfhgfaewn1jmaaw4teaensu8fx9a615if4d96gpc",
  // Connect directly to local Ceramic daemon (has CORS enabled)
  // Start with: ceramic-one daemon --network in-memory && nvm exec ceramic daemon --network inmemory
  ceramicGateway: "http://localhost:7007",
};
