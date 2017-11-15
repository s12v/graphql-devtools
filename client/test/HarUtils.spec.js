import HarUtils from '../services/HarUtils';
import chai from "chai"
let expect = chai.expect;
// let should = chai.should();

describe('HarUtils', () => {
    it('should return postData text', () => {
        const har = {
            request: {
                postData: {
                    text: 'aaa'
                }
            }
        };
        expect(HarUtils.postData(har)).to.be.equal('aaa');
    });

    it('should detect JSON', () => {
        const har = {
            request: {
                headers: [
                    {
                        name: 'content-type',
                        value: 'application/json'
                    }
                ]
            }
        };

        expect(HarUtils.isJson(har)).to.equal(true);
    });

    it('should detect no JSON', () => {
        const har = {
            request: {
                headers: [
                    {
                        name: 'content-type',
                        value: 'text/html'
                    }
                ]
            }
        };

        expect(HarUtils.isJson(har)).to.equal(false);
    });

    it('should return GraphQL query', () => {
        const har = {
            request: {
                headers: [
                    {
                        name: 'content-type',
                        value: 'application/json'
                    }
                ],
                postData: {
                    text: '{"query": "{}"}'
                }
            }
        };

        expect(HarUtils.getGraphQLQuery(har)).to.equal('{}');
    });

});
