# Upstream's published Watchtower image (github.com/nicholas-fedor/watchtower),
# pinned by digest: exactly what upstream's release pipeline built and tested.
# Our fork (github.com/nkprasad12/watchtower) keeps a copy of the source, with
# each pinned release's commit tagged `morcus-pin/<sha>`.
#
# To upgrade:
#   1. Read the release notes, and check for changed defaults in a clone of the
#      fork (after "Sync fork"; keep the fork's Actions disabled):
#        git diff <old-commit> <new-commit> -- docs/configuration | grep -E '^[+-].*Default:'
#   2. Check the new image was built by upstream's release workflow, from the
#      release's commit:
#        gh attestation verify oci://ghcr.io/nicholas-fedor/watchtower@<digest> --repo nicholas-fedor/watchtower
#      Then push a `morcus-pin/<commit>` tag for that commit to the fork.
#   3. Update the tag and digest below, and `morcus-watchtower` in
#      src/scripts/helper_images/expected_tags.ts (the unit tests print it).
# CI then smoke-tests it, and the next `main` release promotes it to `:latest`,
# from which Watchtower updates itself.
#
# The upstream image already sets the `com.centurylinklabs.watchtower` label
# (which Watchtower uses to recognise itself), HEALTHCHECK and ENTRYPOINT.
FROM ghcr.io/nicholas-fedor/watchtower:1.23.2@sha256:62fb91130ddb493f869cad7e198fa260dd16c5da293ed092cbd5d8781566f7a6

# Behaviours we rely on but don't set in docker-compose.yaml, made explicit so
# an upstream default change can't flip them. In particular, `pruner` sits
# stopped on purpose when telemetry is disabled.
ENV WATCHTOWER_INCLUDE_STOPPED=false \
    WATCHTOWER_REVIVE_STOPPED=false \
    WATCHTOWER_INCLUDE_RESTARTING=false \
    WATCHTOWER_ROLLING_RESTART=false
