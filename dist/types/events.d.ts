export declare const EVENT_MAP: {
    'channel.created': boolean;
    'channel.deleted': boolean;
    'channel.hidden': boolean;
    'channel.muted': boolean;
    'channel.truncated': boolean;
    'channel.unmuted': boolean;
    'channel.updated': boolean;
    'channel.visible': boolean;
    'health.check': boolean;
    'member.added': boolean;
    'member.removed': boolean;
    'member.updated': boolean;
    'message.deleted': boolean;
    'message.new': boolean;
    'message.read': boolean;
    'message.updated': boolean;
    'notification.added_to_channel': boolean;
    'notification.channel_deleted': boolean;
    'notification.channel_mutes_updated': boolean;
    'notification.channel_truncated': boolean;
    'notification.invite_accepted': boolean;
    'notification.invite_rejected': boolean;
    'notification.invited': boolean;
    'notification.mark_read': boolean;
    'notification.message_new': boolean;
    'notification.mutes_updated': boolean;
    'notification.removed_from_channel': boolean;
    'reaction.deleted': boolean;
    'reaction.new': boolean;
    'reaction.updated': boolean;
    'typing.start': boolean;
    'typing.stop': boolean;
    'user.banned': boolean;
    'user.deleted': boolean;
    'user.presence.changed': boolean;
    'user.unbanned': boolean;
    'user.updated': boolean;
    'user.watching.start': boolean;
    'user.watching.stop': boolean;
    'connection.changed': boolean;
    'connection.recovered': boolean;
};
export declare const isValidEventType: (eventType: string) => boolean;
//# sourceMappingURL=events.d.ts.map