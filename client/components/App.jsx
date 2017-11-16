import React from 'react';
import Table from './Table';
import HarUtils from '../services/HarUtils';
import {Tab, Tabs, TabList, TabPanel} from 'react-tabs';
import {GraphqlCodeBlock} from 'graphql-syntax-highlighter-react';
import SyntaxHighlighter, {registerLanguage} from "react-syntax-highlighter/light"
import json from 'react-syntax-highlighter/languages/hljs/json';
import {githubGist} from 'react-syntax-highlighter/styles/hljs';

registerLanguage('json', json);

import 'react-tabs/style/react-tabs.scss';
import './styles/app.scss';


export default class App extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            query: 'query {graphQLHub}',
            response: ''
        };
    }

    componentDidMount() {
        // if (typeof this.props.onRequestFinished !== 'undefined') {
        //     this.props.onRequestFinished.addListener(this.handleRequest.bind(this));
        // }
    }

    onContentLoaded(content) {
        try {
            const prettyJson = JSON.stringify(JSON.parse(content), null, 2);
            this.setState(prevState => Object.assign(prevState, {
                response: prettyJson
            }));
        } catch (e) {
            if (e instanceof SyntaxError) {
            } else throw e
        }
    }

    onRowClick(har) {
        console.log(har);

        const query = HarUtils.getGraphQLQuery(har);
        if (query !== null) {
            console.log("this is graphql!");
            this.setState(() => {
                    return {
                        query: query
                    }
                }
            );
            har.getContent(this.onContentLoaded.bind(this));
        } else {
            console.log("this is NOT graphql!");
        }
    }

    render() {
        return <div className="flex-container">
            <div className="left">
                <Table
                    onRequestFinished={this.props.onRequestFinished}
                    onClick={this.onRowClick.bind(this)}
                />
            </div>
            <div className="right">
                <Tabs>
                    <TabList>
                        <Tab>Query</Tab>
                        <Tab>Response</Tab>
                    </TabList>
                    <TabPanel>
                        <GraphqlCodeBlock
                            className="GraphqlCodeBlock"
                            queryBody={this.state.query}
                        />
                    </TabPanel>
                    <TabPanel>
                        <SyntaxHighlighter style={githubGist} language="json">
                            {this.state.response}
                        </SyntaxHighlighter>
                    </TabPanel>
                </Tabs>
            </div>
        </div>;
    }
}
