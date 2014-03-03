(function() {
    var Subscriber, SyncRemote, exec, util;

    Subscriber = require('emissary').Subscriber;
    exec = require('child_process').exec;
    util = require('util');

    module.exports = SyncRemote = (function() {
        Subscriber.includeInto(SyncRemote);

        function SyncRemote() {
            atom.workspace.eachEditor(function(editor) {
                return this.handleBufferEvents(editor);
            }.bind(this));

            atom.workspaceView.eachPane(function(pane) {
                pane.command('sync-remote:sync-file', function() {
                    var editor, buffer;
                    editor = pane.model.getActiveEditor();
                    if (!editor) {
                        return false;
                    }
                    buffer = editor.getBuffer();
                    this.syncLocalPath(buffer.file.path);
                }.bind(this));
            }.bind(this));
        }

        SyncRemote.prototype.destroy = function() {
            return this.unsubscribe();
        };

        SyncRemote.prototype.handleBufferEvents = function(editor) {
            var buffer;
            buffer = editor.getBuffer();
            this.subscribe(buffer, 'saved', function(buffer) {
                if (atom.config.get('sync-remote.syncOnSave')) {
                    return this.syncLocalPath(buffer.file.path);
                }
                return false;
            }.bind(this));
            return this.subscribe(buffer, 'destroyed', function() {
                return this.unsubscribe(buffer);
            }.bind(this));
        };

        SyncRemote.prototype.getRemoteMap = function() {
            var localPath, remotePath, remoteHost, remoteMap;

            localPath = atom.config.get('sync-remote.localPath').split(',');
            remotePath = atom.config.get('sync-remote.remotePath').split(',');
            remoteHost = atom.config.get('sync-remote.remoteHost').split(',');

            if (!(localPath.length && localPath[0])) {
                return false;
            }

            remoteMap = [];
            localPath.forEach(function(path, i) {
                remoteMap.push({
                    localPath: path.trim(),
                    remotePath: remotePath[i < remotePath.length ? i : 0].trim(),
                    remoteHost: remoteHost[i < remoteHost.length ? i : 0].trim()
                });
            }, this);

            return remoteMap;
        };

        // Dumb tilde expansion; use a full path if you're skeptical
        SyncRemote.prototype.tildeExpand = function(path) {
            if (path[0] === '~') {
                path = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + path.substr(1);
            }
            return path;
        };

        SyncRemote.prototype.syncLocalPath = function(localPath) {
            var remoteMapping;
            remoteMapping = this.findRemoteMapping(localPath);
            if (remoteMapping) {
                this.view.syncRemoteStatus.text('Syncing...')
                    .removeClass('text-success text-error')
                    .addClass('text-subtle');
                return this.copyFileWithMapping(
                    localPath,
                    remoteMapping,
                    function(err, stdout, stderr, data) {
                        if (this.view) {
                            clearTimeout(this.status_timeout);
                            this.view.syncRemoteStatus.text('Remote: ' + data.remotePath)
                                .removeClass('text-subtle text-success text-error')
                                .addClass('text-success');
                            this.status_timeout = setTimeout(function() {
                                this.view.syncRemoteStatus.text('');
                            }.bind(this), 3000);
                        }
                    }.bind(this),
                    function() {
                        if (this.view) {
                            clearTimeout(this.status_timeout);
                            this.view.syncRemoteStatus.text('Sync failed :(')
                                .removeClass('text-subtle text-success text-error')
                                .addClass('text-error');
                            this.status_timeout = setTimeout(function() {
                                this.view.syncRemoteStatus.text('');
                            }.bind(this), 3000);
                        }
                    }.bind(this)
                );
            } else {
                return false;
            }
        };

        SyncRemote.prototype.findRemoteMapping = function(path) {
            var remoteMapping, remoteMap;
            remoteMapping = false;
            remoteMap = this.getRemoteMap();
            remoteMap.forEach(function(mapping) {
                if (path.indexOf(this.tildeExpand(mapping.localPath + '/')) === 0) {
                    remoteMapping = mapping;
                    return false;
                }
            }, this);

            return remoteMapping;
        };

        SyncRemote.prototype.copyFileWithMapping = function(localPath, remoteMapping, successCallback, errorCallback) {
            var remoteHost, remotePath;
            remoteHost = remoteMapping.remoteHost;
            remotePath = this.resolveRemotePath(this.tildeExpand(localPath), this.tildeExpand(remoteMapping.localPath), remoteMapping.remotePath);
            return this.copyFileToRemote(localPath, remoteHost, remotePath, successCallback, errorCallback);
        };

        SyncRemote.prototype.buildRemoteHostString = function(host, user, password) {
            if (user && password) {
                return format('%s:%s@%s', user, password, host);
            } else if (user) {
                return format('%s@%s', user, host);
            } else {
                return host;
            }
        };

        SyncRemote.prototype.resolveRemotePath = function(localPath, localRoot, remoteRoot) {
            if (localRoot === remoteRoot) {
                return localPath;
            } else {
                return remoteRoot + localPath.substr(localRoot.length);
            }
        };

        SyncRemote.prototype.createRemotePath = function(remoteHost, remotePath, successCallback, errorCallback) {
            var shellCommand;
            shellCommand = util.format("ssh %s '[ -d %s ] || mkdir -p %s'", remoteHost, remotePath, remotePath);
            return exec(shellCommand, function(error) {
                var args;
                args = Array.prototype.slice.call(arguments, 0);
                args.push({
                    remoteHost: remoteHost,
                    remotePath: remotePath
                });

                if (error) {
                    if (typeof errorCallback === 'function') {
                        errorCallback.apply(this, args);
                    }
                } else {
                    if (typeof successCallback === 'function') {
                        successCallback.apply(this, args);
                    }
                }
            });
        };

        SyncRemote.prototype.copyFileToRemote = function(localPath, remoteHost, remotePath, successCallback, errorCallback, noRetry) {
            var shellCommand, scp;
            scp = '/usr/bin/scp -o ConnectTimeout=5';
            shellCommand = util.format(scp + ' %s %s:%s', localPath, remoteHost, remotePath);
            return exec(shellCommand, function(error) {
                var args;
                args = Array.prototype.slice.call(arguments, 0);
                args.push({
                    localPath: localPath,
                    remoteHost: remoteHost,
                    remotePath: remotePath
                });

                if (error && (error.killed || noRetry)) {
                    if (typeof errorCallback === 'function') {
                        errorCallback.apply(this, args);
                    }
                } else if (error) {
                    this.createRemotePath(
                        remoteHost,
                        remotePath.replace(/(.*)\/([^\/]+)/, '$1'),
                        function(error, out, sterr) {
                            this.copyFileToRemote(
                                localPath,
                                remoteHost,
                                remotePath,
                                successCallback,
                                errorCallback,
                                true // if it still fails, that's it
                            );
                        }.bind(this),
                        errorCallback
                    );
                } else {
                    // Success!
                    if (typeof successCallback === 'function') {
                        successCallback.apply(this, args);
                    }
                }
            }.bind(this));
        };

        return SyncRemote;

    })();

}).call(this);
