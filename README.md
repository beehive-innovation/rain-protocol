# Rain Protocol

Rain Protocol supports fair value capture for intangible or physical assets in a permissionless way in any decentralised environment.

Documentation can be found [here](https://beehive-innovation.github.io/rain-protocol).

## Development setup (contributors)

### Git submodules

As we are wrapping balancer contracts, we have git submodules pointing to their repositories.

When you clone this repository make sure to use `--recurse-submodules`

```
git clone --recurse-submodules git@github.com:thedavidmeister/tv-balancer.git
```

### Nix Shell

Install the nix shell if you haven't already.

```
curl -L https://nixos.org/nix/install | sh
```

Drop into a nix-shell.

```
cd tv-balancer
nix-shell
```

### Run tests

From _outside_ the nix-shell run:

```
nix-shell --run 'hardhat test'
```

Inside the nix-shell you can just run `hardhat test` as normal.

### Run security check

Inside the nix-shell run `security-check`.

**IMPORTANT: `security-check` applies and removes several patches to balancer to get slither compiling**

If you cancel the security check before it is finished your repository may be left in a dirty state.

### Build and serve documentation site

Inside the nix-shell run `docs-dev`. If you want to see search functionality, you'll need to manually build and serve with `docs-build` and then `docs-serve` since search indexing only runs for production builds.

Navigate to http://localhost:3000/ to view the docs site generated with Docusaurus.

Documentation files are written in Markdown and can be found under the `docs/` directory in this repo. The main config file can be found at `docusaurus/docusaurus.config.js`, and sidebar config at `docusaurus/siderbars.js`

### Audits

Audits can be found in the `audits` folder.

### Gas optimisations

Hardhat is configured to leverage the solidity compiler optimizer and report on gas usage for all test runs.

In general clarity and reuse of existing standard functionality, such as Open Zeppelin RBAC access controls, is preferred over micro-optimisation of gas costs.

For many desirable use-cases, such as small independent artists or rural communities, the gas costs on ethereum mainnet will ALWAYS be unaffordable no matter how much we optimise these contracts.

The intent is to keep a reasonable balance between cost and clarity then deploy the contracts to L2 solutions such as Polygon where the baseline gas cost is several orders of magnitude cheaper.

### Unit tests

All functionality is unit tested. The tests are in the `test` folder.

If some functionality or potential exploit is missing a test this is a bug and so an issue and/or PR should be raised.