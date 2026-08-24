# Mobile dependency risk register

Last reviewed: 2026-08-24

| Dependency path | Advisory class | Reachability | Control / disposition |
| --- | --- | --- | --- |
| `react-native-markdown-display -> markdown-it -> linkify-it` | High algorithmic-complexity DoS | Runtime dependency, but vulnerable automatic linkification is disabled | All provider-authored markdown is capped at 32,000 characters, 600 lines and 2,000 characters per line before parsing. Automatic linkification and remote markdown images are disabled; only bounded HTTPS links may open. Regression tests cover oversized, excessive-line and malicious-scheme inputs. No upstream fix is currently available. |
| `expo -> metro -> image-size` | High crafted-image parser DoS | Build-time Metro tooling; the mobile app does not call this package at runtime | Retain the Expo 56-compatible dependency line. Do not process untrusted build assets. Upgrade when Expo publishes a compatible Metro resolution; a forced downgrade/major framework change is not accepted in this branch. |
| `expo -> config plugins -> xcode -> uuid` | Moderate buffer-bound issue | Build/prebuild tooling; affected UUID buffer APIs are not called by LegalBridge runtime | Upgrade with the next controlled Expo toolchain update. `npm audit --force` is prohibited because its proposed resolution changes the Expo line incompatibly. |

CI parses the npm audit JSON and permits only the exact reviewed high-severity
advisory identifiers above. Any new high or critical advisory fails CI even if
it affects a previously reviewed package.
