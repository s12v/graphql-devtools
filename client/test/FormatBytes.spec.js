import formatBytes from '../services/FormatBytes';
import chai from "chai"

let expect = chai.expect;

describe('FormatBytes', () => {
    it('should format bytes', () => {
        expect(formatBytes(1500)).to.be.equal('1.46 KB');
    });

    it('should format bytes with rounding', () => {
        expect(formatBytes(1500, 1)).to.be.equal('1.5 KB');
    });
});
