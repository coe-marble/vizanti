import assert from 'assert';
import { GUI_MESSAGE_TYPE, createFloat } from '../../public/js/modules/gui_messages.js';

describe('GUI messages', function () {
	it('creates an immutable Float message', function () {
		const message = createFloat(2.5);
		assert.deepEqual(message, { type: GUI_MESSAGE_TYPE.FLOAT, value: 2.5 });
		assert.throws(() => { message.value = 3; }, TypeError);
	});

	it('declares the GUI value and data message types', function () {
		assert.equal(GUI_MESSAGE_TYPE.BOOL, 'vizanti/Bool');
		assert.equal(GUI_MESSAGE_TYPE.IMAGE, 'vizanti/Image');
		assert.equal(GUI_MESSAGE_TYPE.PATH, 'vizanti/Path');
		assert.throws(() => createFloat(NaN), TypeError);
	});
});
