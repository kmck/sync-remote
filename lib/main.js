(function() {
    var SyncRemote, SyncRemoteView;

    SyncRemote = require('./sync-remote');
    SyncRemoteView = require('./sync-remote-view');

    module.exports = {
        configDefaults: {
            syncOnSave: true,
            // ignorePaths: '',
            localPath: '',
            remotePath: '',
            remoteHost: ''
        },
        activate: function() {
            this.syncRemote = new SyncRemote();
            this.syncRemoteView = new SyncRemoteView();
            this.syncRemote.view = this.syncRemoteView;
            return this.syncRemote;
        },
        deactivate: function() {
            return this.syncRemote.destroy();
        }
    };

}).call(this);
