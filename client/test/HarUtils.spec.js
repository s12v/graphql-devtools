import HarUtils from '../services/HarUtils';
import chai from "chai"
import merge from "deepmerge"

let expect = chai.expect;

describe('HarUtils', () => {
    it('should return postData text', () => {
        const har = harWithPostData({}, 'aaa');
        expect(HarUtils.postData(har)).to.be.equal('aaa');
    });

    it('should detect JSON', () => {
        const har = harWithHeader({}, 'content-type', 'application/json');
        expect(HarUtils.isJson(har)).to.equal(true);
    });

    it('should detect JSON with charset', () => {
        const har = harWithHeader({}, 'content-type', 'application/json; charset=utf-8');
        expect(HarUtils.isJson(har)).to.equal(true);
    });

    it('should detect no JSON', () => {
        const har = harWithHeader({}, 'content-type', 'text/html');
        expect(HarUtils.isJson(har)).to.equal(false);
    });

    it('should return GraphQL query', () => {
        let har = harWithHeader({}, 'content-type', 'application/json');
        har = harWithPostData(har, '{"query": "{}"}');
        console.log(har);
        expect(HarUtils.getGraphQLQuery(har)).to.equal('{}');
    });


    function harWithPostData(har, text) {
        return merge(har, {
            request: {
                postData: {
                    text: text
                }

            }
        });
    }

    function harWithHeader(har, name, value) {
        return merge(har, {
            request: {
                headers: [
                    {
                        name: name,
                        value: value
                    }
                ]
            }
        });
    }
});
