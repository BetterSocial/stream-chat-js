import {
	getTestClient,
	createUsers,
	createUserToken,
	expectHTTPErrorCode,
	getTestClientForUser,
	sleep,
} from './utils';
import { AllowAll, DenyAll } from '../src/permissions';
import uuidv4 from 'uuid/v4';
import chai from 'chai';
import fs from 'fs';
import chaiAsPromised from 'chai-as-promised';

chai.use(require('chai-like'));
chai.use(chaiAsPromised);

const expect = chai.expect;

describe('Query Channels', function() {
	const client = getTestClient(true);

	before(async () => {
		for (let i = 0; i < 10; i++) {
			await client
				.channel('team', uuidv4(), { created_by: { id: 'tommaso' } })
				.create();
		}
	});

	it('watch should error', async function() {
		await expectHTTPErrorCode(
			400,
			client.queryChannels({}, {}, { watch: true, presence: false }),
		);
	});

	it('presence should error', async function() {
		await expectHTTPErrorCode(
			400,
			client.queryChannels({}, {}, { watch: false, presence: true }),
		);
	});

	it('state should work fine', async function() {
		const response = await client.queryChannels(
			{},
			{},
			{ watch: false, presence: false, state: true },
		);
		expect(response).to.have.length(10);
	});
});

describe('Managing users', function() {
	const client = getTestClient(true);
	const user = {
		id: uuidv4(),
	};

	it('edit user inserts if missing', async function() {
		await client.updateUser(user);
		const response = await client.queryUsers(
			{ id: user.id },
			{},
			{ presence: false },
		);
		expect(response.users[0].id).to.eql(user.id);
		expect(response.users[0].role).to.eql('user');
	});

	it('change user data', async function() {
		user.os = 'gnu/linux';
		await client.updateUser(user);
		const response = await client.queryUsers(
			{ id: user.id },
			{},
			{ presence: false },
		);
		expect(response.users[0].id).to.eql(user.id);
		expect(response.users[0].role).to.eql('user');
		expect(response.users[0].os).to.eql('gnu/linux');
	});

	it('change user role', async function() {
		user.role = 'admin';
		await client.updateUser(user);
		const response = await client.queryUsers(
			{ id: user.id },
			{},
			{ presence: false },
		);
		expect(response.users[0].id).to.eql(user.id);
		expect(response.users[0].role).to.eql('admin');
	});

	it('ban user', async function() {
		await client.banUser(user.id);
	});

	it('remove ban', async function() {
		await client.unbanUser(user.id);
	});
});

describe('CreatedBy storage', function() {
	const createdById = uuidv4();
	const channelId = uuidv4();
	const client = getTestClient(true);

	it('Created by should be stored', async () => {
		const channel = client.channel('messaging', channelId, {
			created_by: { id: createdById },
		});
		const createResponse = await channel.create();

		expect(createResponse.channel.created_by.id).to.equal(createdById);
		expect(channel._data.created_by.id).to.equal(createdById);
		expect(channel.data.created_by.id).to.equal(createdById);
	});
});

describe('App configs', function() {
	const client = getTestClient(true);
	const client2 = getTestClient(false);

	const user = { id: 'guyon' };
	const createdById = uuidv4();
	const userToken =
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiZ3V5b24ifQ.c8ofzBnAuW1yVaznCDv0iGeoJQ-csme7kPpIMOjtkso';

	let secretChannel;
	let channel;

	before(async function() {
		channel = client.channel('messaging', 'secret-place', {
			created_by: { id: `${createdById}` },
		});
		secretChannel = await channel.create();
	});

	it('Empty request should not break', async function() {
		await client.updateAppSettings({});
	});

	it('Using a tampered token fails because of auth enabled', async function() {
		await expectHTTPErrorCode(401, client2.setUser(user, userToken));
		client2.disconnect();
	});

	it('Using dev token fails because of auth enabled', async function() {
		await expectHTTPErrorCode(401, client2.setUser(user, client2.devToken(user.id)));
		client2.disconnect();
	});

	it('Disable auth checks', async function() {
		await client.updateAppSettings({
			disable_auth_checks: true,
		});
		await sleep(1000);
	});

	it('Using a tampered token does not fail because auth is disabled', async function() {
		await client2.setUser(user, userToken);
		client2.disconnect();
	});

	it('Using dev token does not fail because auth is disabled', async function() {
		await client2.setUser(user, client2.devToken(user.id));
		client2.disconnect();
	});

	it('Disable permission checks', async function() {
		await client.updateAppSettings({
			disable_permissions_checks: true,
		});
		await sleep(1000);
	});

	it('A user can do super stuff because permission checks are off', async function() {
		await client2.setUser(user, userToken);
		await client2.channel('messaging', 'secret-place').watch();
		client2.disconnect();
	});

	it('Re-enable permission checks', async function() {
		await client.updateAppSettings({
			disable_permissions_checks: false,
		});
		await sleep(1000);
	});

	it('A user cannot do super stuff because permission checks are back on', async function() {
		const client = await getTestClientForUser(uuidv4());
		await expectHTTPErrorCode(
			403,
			client.channel('messaging', 'secret-place').watch(),
		);
	});

	it('Re-enable auth checks', async function() {
		await client.updateAppSettings({
			disable_auth_checks: false,
		});
		await sleep(1000);
	});

	it('Using a tampered token fails because auth is back on', async function() {
		await expectHTTPErrorCode(401, client2.setUser(user, userToken));
		client2.disconnect();
	});

	describe('Push notifications', function() {
		describe('APN', function() {
			it('Adding bad apn certificate config', async function() {
				await expectHTTPErrorCode(
					400,
					client.updateAppSettings({
						apn_config: {
							auth_type: 'certificate',
							p12_cert: 'boogus',
						},
					}),
				);
			});
			it('Adding good apn certificate config', async function() {
				await client.updateAppSettings({
					apn_config: {
						auth_type: 'certificate',
						p12_cert: fs.readFileSync(
							'./test/push_test/stream-push-test.p12',
						),
					},
				});
			});
			it('Describe app settings', async function() {
				const response = await client.getAppSettings();
				expect(response.app).to.be.an('object');
				expect(response.app.push_notifications).to.be.an('object');
				delete response.app.push_notifications.apn.notification_template;
				expect(response.app.push_notifications.apn).to.eql({
					enabled: true,
					auth_type: 'certificate',
					bundle_id: 'stream-test',
					host: 'https://api.development.push.apple.com',
				});
			});
			it('Adding bad apn invalid template', async function() {
				await expectHTTPErrorCode(
					400,
					client.updateAppSettings({
						apn_config: {
							auth_type: 'certificate',
							p12_cert: fs.readFileSync(
								'./test/push_test/stream-push-test.p12',
							),
							notification_template: '{ {{ } }',
						},
					}),
				);
			});
			it('Adding bad apn message is not a valid JSON', async function() {
				await expectHTTPErrorCode(
					400,
					client.updateAppSettings({
						apn_config: {
							auth_type: 'certificate',
							p12_cert: fs.readFileSync(
								'./test/push_test/stream-push-test.p12',
							),
							notification_template: '{{ message.id }}',
						},
					}),
				);
			});
			it('Adding bad apn token', async function() {
				await expectHTTPErrorCode(
					400,
					client.updateAppSettings({
						apn_config: {
							auth_type: 'token',
							bundle_id: 'com.apple.test',
							auth_key: 'supersecret',
							key_id: 'keykey',
							team_id: 'sfd',
						},
					}),
				);
			});
			it('Adding incomplete token data: no bundle_id', async function() {
				await expectHTTPErrorCode(
					400,
					client.updateAppSettings({
						apn_config: {
							auth_type: 'token',
							auth_key: fs.readFileSync(
								'./test/push_test/push-test-auth-key.p8',
								'utf-8',
							),
							key_id: 'keykey',
							team_id: 'sfd',
							bundle_id: '',
						},
					}),
				);
			});
			it('Adding incomplete token data: no key_id', async function() {
				await expectHTTPErrorCode(
					400,
					client.updateAppSettings({
						apn_config: {
							auth_type: 'token',
							auth_key: fs.readFileSync(
								'./test/push_test/push-test-auth-key.p8',
								'utf-8',
							),
							key_id: '',
							bundle_id: 'bundly',
							team_id: 'sfd',
						},
					}),
				);
			});
			it('Adding incomplete token data: no team', async function() {
				await expectHTTPErrorCode(
					400,
					client.updateAppSettings({
						apn_config: {
							auth_type: 'token',
							auth_key: fs.readFileSync(
								'./test/push_test/push-test-auth-key.p8',
								'utf-8',
							),
							key_id: 'keykey',
							bundle_id: 'sfd',
							team_id: '',
						},
					}),
				);
			});
			it('Adding good apn token', async function() {
				await client.updateAppSettings({
					apn_config: {
						auth_type: 'token',
						auth_key: fs.readFileSync(
							'./test/push_test/push-test-auth-key.p8',
							'utf-8',
						),
						key_id: 'keykey',
						bundle_id: 'com.apple.test',
						team_id: 'sfd',
					},
				});
			});
			it('Describe app settings', async function() {
				const response = await client.getAppSettings();
				expect(response.app).to.be.an('object');
				expect(response.app.push_notifications).to.be.an('object');
				delete response.app.push_notifications.apn.notification_template;
				expect(response.app.push_notifications.apn).to.eql({
					enabled: true,
					auth_type: 'token',
					bundle_id: 'com.apple.test',
					host: 'https://api.push.apple.com',
					team_id: 'sfd',
					key_id: 'keykey',
				});
			});
			it('Adding good apn token in dev mode', async function() {
				await client.updateAppSettings({
					apn_config: {
						auth_type: 'token',
						auth_key: fs.readFileSync(
							'./test/push_test/push-test-auth-key.p8',
							'utf-8',
						),
						key_id: 'keykey',
						bundle_id: 'com.apple.test',
						team_id: 'sfd',
						development: true,
					},
				});
			});
			it('Describe app settings', async function() {
				const response = await client.getAppSettings();
				expect(response.app).to.be.an('object');
				expect(response.app.push_notifications).to.be.an('object');
				delete response.app.push_notifications.apn.notification_template;
				expect(response.app.push_notifications.apn).to.eql({
					enabled: true,
					auth_type: 'token',
					bundle_id: 'com.apple.test',
					team_id: 'sfd',
					key_id: 'keykey',
					host: 'https://api.development.push.apple.com',
				});
			});
			it('Disable APN', async function() {
				await client.updateAppSettings({
					apn_config: {
						disabled: true,
					},
				});
			});
			it('Describe app settings', async function() {
				const response = await client.getAppSettings();
				expect(response.app).to.be.an('object');
				expect(response.app.push_notifications).to.be.an('object');
				delete response.app.push_notifications.apn.notification_template;
				expect(response.app.push_notifications.apn).to.eql({
					enabled: false,
					host: 'https://api.push.apple.com',
				});
			});
		});
		describe('Firebase', function() {
			it('Adding bad template', async function() {
				await expectHTTPErrorCode(
					400,
					client.updateAppSettings({
						firebase_config: {
							notification_template: '{ {{ } }',
						},
					}),
				);
			});

			it('Adding invalid json template', async function() {
				await expectHTTPErrorCode(
					400,
					client.updateAppSettings({
						apn_config: {
							notification_template: '{{ message.id }}',
						},
					}),
				);
			});
			it('Adding invalid server key', async function() {
				await expectHTTPErrorCode(
					400,
					client.updateAppSettings({
						firebase_config: {
							server_key: 'asdasd',
							notification_template: '{ }',
						},
					}),
				);
			});
			it('Adding good server key', async function() {
				await client.updateAppSettings({
					firebase_config: {
						server_key:
							'AAAAyMwm738:APA91bEpRfUKal8ZeVMbpe8eLyo6T1LK7IhMCETwEOrXoPXFTHHsu7JGQVDElTgVyboNhNmoPoAjQxfRWOR6NOQm5eo7cLA5Uf-PB5qRIGDdl62dIrDkTxMv7UjoGvNDYzr4EFFfoE2u',
						notification_template: '{ }',
					},
				});
			});
			it('Describe app settings', async function() {
				const response = await client.getAppSettings();
				expect(response.app).to.be.an('object');
				expect(response.app.push_notifications).to.be.an('object');
				delete response.app.push_notifications.firebase.notification_template;
				expect(response.app.push_notifications.firebase).to.eql({
					enabled: true,
				});
			});
			it('Disable firebase', async function() {
				await client.updateAppSettings({
					firebase_config: {
						disabled: true,
					},
				});
			});
			it('Describe app settings', async function() {
				const response = await client.getAppSettings();
				expect(response.app).to.be.an('object');
				expect(response.app.push_notifications).to.be.an('object');
				delete response.app.push_notifications.firebase.notification_template;
				expect(response.app.push_notifications.firebase).to.eql({
					enabled: false,
				});
			});
		});
	});

	describe('Push notifications test endpoint', function() {
		const deviceID = uuidv4();
		const userID = uuidv4();
		const apnConfig = {
			auth_key: fs.readFileSync('./test/push_test/push-test-auth-key.p8', 'utf-8'),
			key_id: 'whatever',
			team_id: 'stream',
			bundle_id: 'bundle',
			auth_type: 'token',
		};
		const firebaseConfig = {
			server_key:
				'AAAAyMwm738:APA91bEpRfUKal8ZeVMbpe8eLyo6T1LK7IhMCETwEOrXoPXFTHHsu7JGQVDElTgVyboNhNmoPoAjQxfRWOR6NOQm5eo7cLA5Uf-PB5qRIGDdl62dIrDkTxMv7UjoGvNDYzr4EFFfoE2u',
		};

		before(async function() {
			await client.addDevice(deviceID, 'apn', userID);
		});

		after(async function() {
			await client.removeDevice(deviceID, userID);
		});

		beforeEach(async function() {
			await client.updateAppSettings({
				apn_config: {
					disabled: true,
				},
				firebase_config: {
					disabled: true,
				},
			});
			await sleep(200);
		});

		it('User has no devices', async function() {
			await client.removeDevice(deviceID, userID);
			const p = client.testPushSettings(userID);
			await expect(p).to.be.rejectedWith(`User has no devices associated`);
			await client.addDevice(deviceID, 'apn', userID);
		});

		it('App has push disabled', async function() {
			const p = client.testPushSettings(userID);
			await expect(p).to.be.rejectedWith(
				`Your app doesn't have push notifications enabled`,
			);
		});

		it('No APN + APN template', async function() {
			await client.updateAppSettings({
				firebase_config: firebaseConfig,
			});

			const p = client.testPushSettings(userID, { apnTemplate: '{}' });
			await expect(p).to.be.rejectedWith(
				`APN template provided, but app doesn't have APN push notifcations configured`,
			);
		});

		it('No Firebase + firebase template', async function() {
			await client.updateAppSettings({
				apn_config: apnConfig,
			});

			const p = client.testPushSettings(userID, { firebaseTemplate: '{}' });
			await expect(p).to.be.rejectedWith(
				`Firebase template provided, but app doesn't have firebase push notifcations configured`,
			);
		});

		it('Bad message id', async function() {
			await client.updateAppSettings({
				apn_config: apnConfig,
			});
			const msgID = uuidv4();
			const p = client.testPushSettings(userID, { messageID: msgID });
			await expect(p).to.be.rejectedWith(`Message with id ${msgID} not found`);
		});

		it('Bad apn template error gets returned in response', async function() {
			await client.updateAppSettings({
				apn_config: apnConfig,
			});

			const response = await client.testPushSettings(userID, {
				apnTemplate: '{{}',
			});
			expect(response).to.not.have.property('rendered_apn_template');
			expect(response.general_errors).to.have.length(1);
			expect(response.general_errors).to.have.members([
				'APN template is invalid: notification_template is not a valid handlebars template',
			]);
		});

		it('Bad firebase template error gets returned in response', async function() {
			await client.updateAppSettings({
				firebase_config: firebaseConfig,
			});

			const response = await client.testPushSettings(userID, {
				firebaseTemplate: '{{}',
			});
			expect(response).to.not.have.property('rendered_firebase_template');
			expect(response.general_errors).to.have.length(1);
			expect(response.general_errors).to.have.members([
				'Firebase template is invalid: notification_template is not a valid handlebars template',
			]);
		});

		it('All good', async function() {
			await client.updateAppSettings({
				firebase_config: firebaseConfig,
			});

			const response = await client.testPushSettings(userID, {
				firebaseTemplate: '{}',
			});
			expect(response.rendered_firebase_template).to.eq('{}');
		});
	});
});

describe('Devices', function() {
	const client = getTestClient(true);
	const deviceId = uuidv4();

	describe('No user id provided', function() {
		it(`can't add devices`, async function() {
			await expectHTTPErrorCode(400, client.addDevice(deviceId, 'apn'));
		});
		it(`cant't list devices`, async function() {
			await expectHTTPErrorCode(400, client.getDevices());
		});
	});

	describe('User id provided', function() {
		const users = [uuidv4(), uuidv4()];
		const devices = [uuidv4(), uuidv4()];

		it('can add devices to any user', async function() {
			for (const i of Array(2).keys()) {
				await client.addDevice(devices[i], 'apn', users[i]);
			}
		});
		it('can fetch devices from any user', async function() {
			for (const i of Array(2).keys()) {
				const result = await client.getDevices(users[i]);
				expect(result.devices.length).to.equal(1);
				expect(result.devices[0].id).to.equal(devices[i]);
			}
		});
		it('can delete any device', async function() {
			await client.removeDevice(devices[1], users[1]);
			const result = await client.getDevices(devices[1], users[1]);
			expect(result.devices.length).to.equal(0);
		});
	});
});

describe('Moderation', function() {
	const srvClient = getTestClient(true);
	const [srcUser, targetUser] = [uuidv4(), uuidv4()];

	before(async function() {
		await createUsers([srcUser, targetUser]);
	});

	describe('Mutes', function() {
		it('source user not set', async function() {
			await expectHTTPErrorCode(400, srvClient.muteUser(targetUser));
		});
		it('source user set', async function() {
			const data = await srvClient.muteUser(targetUser, srcUser);
			expect(data.mute.user.id).to.equal(srcUser);
			expect(data.mute.target.id).to.equal(targetUser);

			const client = getTestClient(false);
			const connectResponse = await client.setUser(
				{ id: srcUser },
				createUserToken(srcUser),
			);
			expect(connectResponse.me.mutes.length).to.equal(1);
			expect(connectResponse.me.mutes[0].target.id).to.equal(targetUser);
		});
	});

	describe('Unmutes', function() {
		it('source user not set', async function() {
			await expectHTTPErrorCode(400, srvClient.unmuteUser(targetUser));
		});
		it('source user set', async function() {
			await srvClient.unmuteUser(targetUser, srcUser);

			const client = getTestClient(false);
			const connectResponse = await client.setUser(
				{ id: srcUser },
				createUserToken(srcUser),
			);
			expect(connectResponse.me.mutes.length).to.equal(0);
		});
	});
});

describe('Import via Webhook compat', function() {
	// based on the use case that you are importing data to stream via
	// a webhook integration...
	const srvClient = getTestClient(true);

	const channelID = uuidv4();
	const created_by = { id: uuidv4() };

	it('Created At should work', async function() {
		const channel = srvClient.channel('messaging', channelID, { created_by });
		await channel.create();
		const response = await channel.sendMessage({
			text: 'an old message',
			created_at: '2017-04-08T17:36:10.540Z',
			user: created_by,
		});
		expect(response.message.created_at).to.equal('2017-04-08T17:36:10.54Z');
	});

	it('Updated At should work', async function() {
		const channel = srvClient.channel('messaging', channelID, { created_by });
		await channel.create();
		const response = await channel.sendMessage({
			text: 'an old message',
			updated_at: '2017-04-08T17:36:10.540Z',
			user: created_by,
		});
		expect(response.message.updated_at).to.equal('2017-04-08T17:36:10.54Z');
	});

	it('Client side should raise an error', async function() {
		const userID = uuidv4();
		const userClient = await getTestClientForUser(userID);
		const channel = userClient.channel('livestream', channelID);
		await channel.create();
		const responsePromise = channel.sendMessage({
			text: 'an old message',
			created_at: '2017-04-08T17:36:10.540Z',
			user: created_by,
		});
		await expect(responsePromise).to.be.rejectedWith(
			'message.updated_at or message.created_at',
		);
	});

	it('Mark Read should fail without a user', async function() {
		const channel = srvClient.channel('messaging', channelID, { created_by });
		await channel.create();
		const responsePromise = channel.markRead();
		await expect(responsePromise).to.be.rejectedWith(
			'Please specify a user when sending an event server side',
		);
	});

	it('Mark Read should work server side', async function() {
		const userID = uuidv4();
		const channel = srvClient.channel('messaging', channelID, { created_by });
		await channel.create();
		const response = await channel.markRead({ user: { id: userID } });
	});
});

describe('User management', function() {
	const srvClient = getTestClient(true);
	const userClient = getTestClient(false);
	it('Admin with extra fields', async function() {
		// verify we correctly store user information
		const userID = uuidv4();
		const user = {
			id: userID,
			name: 'jelte',
			role: 'admin',
		};
		const response = await srvClient.updateUser(user);
		const compareUser = (userResponse, online) => {
			const expectedData = { role: 'user', ...user };
			expect(userResponse).to.contains(expectedData);
			expect(userResponse.online).to.equal(online);
			expect(userResponse.created_at).to.be.ok;
			expect(userResponse.updated_at).to.be.ok;
			expect(userResponse.created_at).to.not.equal('0001-01-01T00:00:00Z');
			expect(userResponse.updated_at).to.not.equal('0001-01-01T00:00:00Z');
			expect(userResponse.created_at.substr(-1)).to.equal('Z');
			expect(userResponse.updated_at.substr(-1)).to.equal('Z');
		};
		compareUser(response.users[userID], false);

		const channelID = uuidv4();

		userClient.setUser(user, createUserToken(userID));
		const channel = userClient.channel('livestream', channelID);
		await channel.watch();

		// make an API call so the data is sent over
		const text = 'Jelte says hi!';
		const data = await channel.sendMessage({ text });

		// verify the user information is correct
		compareUser(data.message.user, true);
		expect(data.message.text).to.equal(text);
	});
});

describe('Channel types', function() {
	const client = getTestClient(true);
	const newType = uuidv4();

	describe('Creating channel types', function() {
		let newChannelType;

		it('should work fine', async function() {
			newChannelType = await client.createChannelType({
				name: newType,
				commands: ['all'],
			});
			await sleep(1000);
		});

		it('should have the right defaults and name', function() {
			const expectedData = {
				automod: 'AI',
				commands: ['giphy', 'flag', 'ban', 'unban', 'mute', 'unmute'],
				connect_events: true,
				max_message_length: 5000,
				message_retention: 'infinite',
				mutes: true,
				name: `${newType}`,
				reactions: true,
				replies: true,
				search: true,
				read_events: true,
				typing_events: true,
			};
			expect(newChannelType).like(expectedData);
		});

		it('should have the default permissions', function() {
			expect(newChannelType.permissions).to.have.length(7);
		});

		it('should fail to create an already existing type', async function() {
			await expectHTTPErrorCode(400, client.createChannelType({ name: newType }));
		});
	});

	describe('Updating channel types', function() {
		let channelType, channelTypeName;
		let channelPermissions;

		it('updating a not existing one should fail', async function() {
			await expectHTTPErrorCode(404, client.updateChannelType(`${uuidv4()}`, {}));
		});

		it('create a new one with defaults', async function() {
			channelTypeName = uuidv4();
			channelType = await client.createChannelType({
				name: channelTypeName,
				commands: ['ban'],
			});
			channelPermissions = channelType.permissions;
			expect(channelPermissions).to.have.length(7);
			await sleep(1000);
		});

		it('defaults should be there via channel.watch', async function() {
			const client = await getTestClientForUser('tommaso');
			const data = await client.channel(channelTypeName, 'test').watch();
			const expectedData = {
				automod: 'AI',
				commands: [
					{
						args: '[@username] [text]',
						description: 'Ban a user',
						name: 'ban',
						set: 'moderation_set',
					},
				],
				connect_events: true,
				max_message_length: 5000,
				message_retention: 'infinite',
				mutes: true,
				name: `${channelTypeName}`,
				reactions: true,
				replies: true,
				search: true,
				read_events: true,
				typing_events: true,
			};
			expect(data.channel.config).like(expectedData);
		});

		it('flip replies config to false', async function() {
			const response = await client.updateChannelType(channelTypeName, {
				replies: false,
			});
			expect(response.replies).to.be.false;
			await sleep(1000);
		});

		it('new configs should be returned from channel.query', async function() {
			const client = await getTestClientForUser('tommaso');
			const data = await client.channel(channelTypeName, 'test').watch();
			const expectedData = {
				automod: 'AI',
				commands: [
					{
						args: '[@username] [text]',
						description: 'Ban a user',
						name: 'ban',
						set: 'moderation_set',
					},
				],
				connect_events: true,
				max_message_length: 5000,
				message_retention: 'infinite',
				mutes: true,
				name: `${channelTypeName}`,
				reactions: true,
				replies: false,
				search: true,
				read_events: true,
				typing_events: true,
			};
			expect(data.channel.config).like(expectedData);
		});

		it('changing permissions', async function() {
			const response = await client.updateChannelType(channelTypeName, {
				permissions: [AllowAll, DenyAll],
			});
			expect(response.permissions).to.have.length(2);
		});

		it('changing commands to a bad one', async function() {
			const p = client.updateChannelType(channelTypeName, {
				commands: ['bogus'],
			});
			await expectHTTPErrorCode(400, p);
		});

		it('changing commands to all', async function() {
			const response = await client.updateChannelType(channelTypeName, {
				commands: ['all'],
			});
			expect(response.commands).to.have.length(6);
		});

		it('changing commands to fun_set', async function() {
			const response = await client.updateChannelType(channelTypeName, {
				commands: ['fun_set'],
			});
			expect(response.commands).to.have.length(1);
		});

		it('changing the name should fail', async function() {
			const p = client.updateChannelType(channelTypeName, {
				name: 'something-else',
			});
			await expectHTTPErrorCode(400, p);
		});

		it('changing the updated_at field should fail', async function() {
			const p = client.updateChannelType(channelTypeName, {
				updated_at: 'something-else',
			});
			await expectHTTPErrorCode(400, p);
		});
	});

	describe('Deleting channel types', function() {
		const name = uuidv4();

		it('should fail to delete a missing type', async function() {
			await expectHTTPErrorCode(404, client.deleteChannelType(uuidv4()));
		});

		it('should work fine', async function() {
			await client.createChannelType({ name });
			await sleep(1000);
			await client.deleteChannelType(name);
			await sleep(1000);
		});

		it('should fail to delete a deleted type', async function() {
			await expectHTTPErrorCode(404, client.deleteChannelType(name));
		});

		describe('deleting a channel type with active channels should fail', function() {
			const typeName = uuidv4();

			it('create a new type', async function() {
				await client.createChannelType({ name: typeName });
				await sleep(1000);
			});

			it('create a channel of the new type', async function() {
				const tClient = await getTestClientForUser('tommaso');
				await tClient.channel(typeName, 'general').watch();
			});

			it('create a channel of the new type', async function() {
				await expectHTTPErrorCode(400, client.deleteChannelType(typeName));
			});
		});
	});

	describe('Get channel type', function() {
		let channelData;

		it('should fail to get a missing type', async function() {
			await expectHTTPErrorCode(404, client.getChannelType(uuidv4()));
		});

		it('should return messaging type correctly', async function() {
			channelData = await client.getChannelType('messaging');
		});

		it('should have default permissions', function() {
			expect(channelData.permissions).to.have.length(7);
			expect(channelData.permissions[0].action).to.eq('Allow');
			expect(channelData.permissions[1].action).to.eq('Deny');
		});

		it('should return configs correctly', function() {
			const expectedData = {
				automod: 'disabled',
				commands: [
					{
						args: '[text]',
						description: 'Post a random gif to the channel',
						name: 'giphy',
						set: 'fun_set',
					},
					{
						args: '[@username]',
						description: 'Flag a user',
						name: 'flag',
						set: 'moderation_set',
					},
					{
						args: '[@username] [text]',
						description: 'Ban a user',
						name: 'ban',
						set: 'moderation_set',
					},
					{
						args: '[@username]',
						description: 'Unban a user',
						name: 'unban',
						set: 'moderation_set',
					},
					{
						args: '[@username]',
						description: 'Mute a user',
						name: 'mute',
						set: 'moderation_set',
					},
					{
						args: '[@username]',
						description: 'Unmute a user',
						name: 'unmute',
						set: 'moderation_set',
					},
				],
				connect_events: true,
				max_message_length: 5000,
				message_retention: 'infinite',
				mutes: true,
				name: 'messaging',
				reactions: true,
				replies: true,
				search: true,
				read_events: true,
				typing_events: true,
			};
			expect(channelData).like(expectedData);
		});
	});

	describe('List channel types', function() {
		let channelTypes;

		it('should return at least the defaults channel types', async function() {
			channelTypes = await client.listChannelTypes();
			expect(Object.keys(channelTypes.channel_types).length).to.gte(10);
		});

		it('default messaging channel type should have default permissions', function() {
			expect(channelTypes.channel_types.messaging.permissions).to.have.length(7);
		});

		it('should return configs correctly for channel type messaging', function() {
			const expectedData = {
				automod: 'disabled',
				commands: [
					{
						args: '[text]',
						description: 'Post a random gif to the channel',
						name: 'giphy',
						set: 'fun_set',
					},
					{
						args: '[@username]',
						description: 'Flag a user',
						name: 'flag',
						set: 'moderation_set',
					},
					{
						args: '[@username] [text]',
						description: 'Ban a user',
						name: 'ban',
						set: 'moderation_set',
					},
					{
						args: '[@username]',
						description: 'Unban a user',
						name: 'unban',
						set: 'moderation_set',
					},
					{
						args: '[@username]',
						description: 'Mute a user',
						name: 'mute',
						set: 'moderation_set',
					},
					{
						args: '[@username]',
						description: 'Unmute a user',
						name: 'unmute',
						set: 'moderation_set',
					},
				],
				connect_events: true,
				max_message_length: 5000,
				message_retention: 'infinite',
				mutes: true,
				name: 'messaging',
				reactions: true,
				replies: true,
				search: true,
				read_events: true,
				typing_events: true,
			};
			expect(channelTypes.channel_types.messaging).like(expectedData);
		});
	});

	describe('Client-side validation', function() {
		let client2;

		before(async () => {
			client2 = await getTestClientForUser('tommaso');
		});

		it('should fail to create', async function() {
			await expectHTTPErrorCode(403, client2.createChannelType({ name: uuidv4() }));
		});

		it('should fail to delete', async function() {
			await expectHTTPErrorCode(403, client2.deleteChannelType('messaging'));
		});

		it('should fail to update', async function() {
			await expectHTTPErrorCode(403, client2.updateChannelType('messaging', {}));
		});
	});
});