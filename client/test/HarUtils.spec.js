import HarUtils from '../services/HarUtils';
import chai from "chai"
import merge from "deepmerge"

let expect = chai.expect;

describe('HarUtils', () => {
    it('should return postData text', () => {
        const har = harWithPostData({}, 'aaa');
        expect(HarUtils.postData(har)).to.be.equal('aaa');
    });

    it('should return empty postData on invalid har', () => {
        expect(HarUtils.postData({})).to.be.equal('');
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

    it('should return single GraphQL query', () => {
        let har = harWithHeader({}, 'content-type', 'application/json');
        har = harWithPostData(har, '{"query": "{}"}');
        expect(HarUtils.getGraphQLQueries(har)).to.deep.equal([ { query: '{}', operation: undefined, variables: {} } ]);
    });

    it('should not pickup a non GraphQL query', () => {
        let har = harWithHeader({}, 'content-type', 'application/json');
        expect(HarUtils.getGraphQLQueries(har)).to.deep.equal([]);
    });

    it('should return GraphQL query with multiple operations', () => {
        const query = '[{"operationName": "one", "variables":{},"query":"query testOne {\n one \n} }\n"}, {"operationName": "two", "variables":{},"query":"query testTwo {\n two \n} }\n"}]';
        let har = harWithHeader({}, 'content-type', 'application/json');
        har = harWithPostData(har, query);
        expect(HarUtils.getGraphQLQueries(har)).to.deep.equal([
          { query: 'query testOne { one } }', operation: 'one', variables: {} },
          { query: 'query testTwo { two } }', operation: 'two', variables: {} }
        ]
      );
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
    };
});
