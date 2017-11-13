export default class HarUtils {

    static postData(har) {
        return har.request.postData.text;
    }

    static isJson(har) {
        return HarUtils.isContentType(har, 'application/json');
    }

    static isContentType(har, contentType) {
        const lowercaseContentType = contentType.toLowerCase();
        har.request.headers.some(header => {
            return header.name.toLowerCase() === 'content-type'
                && header.value.split(';')[0].toLowerCase() === lowercaseContentType
        })
    }

    static isGraphQLRequest(har) {
        try {
            return this.isJson(har) && JSON.parse(this.postData(har)).query;
        } catch (e) {
            if (e instanceof SyntaxError) {
            } else throw e
        }
        return false
    }
}
