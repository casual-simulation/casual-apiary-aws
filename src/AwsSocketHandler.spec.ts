import { AwsSocketHandler } from './AwsSocketHandler';

describe('AwsSocketHandler', () => {
    describe('encode()', () => {
        let handler: AwsSocketHandler;

        beforeEach(() => {
            handler = new AwsSocketHandler(1_000);
        });

        it('should encode the given data', () => {
            const messages = handler.encode('abcdefghijk', 0);
            expect(messages).toHaveLength(1);
            expect(messages[0]).not.toEqual('');
        });
    });
});
