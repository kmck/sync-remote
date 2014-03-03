{View} = require 'atom'

module.exports =
class SyncRemoteView extends View
    @content: ->
        @div class: 'inline-block sync-remote', =>
            @span outlet: "syncRemoteStatus", class: 'atom-sync-remote-status', tabindex: '-1', ""

    initialize: ->
        # We wait until all the other packages have been loaded,
        # so all the other status bar views have been attached
        @subscribe atom.packages.once 'activated', =>
            # We use an ugly setTimeout here to make sure our view gets
            # added as the "last" (farthest right) item in the
            # left side of the status bar
            setTimeout =>
                atom.workspaceView.statusBar.appendLeft(this)
            , 1
