import React from 'react';
import Table from './Table';
import HarUtils from '../services/HarUtils';
import {Tab, Tabs, TabList, TabPanel} from 'react-tabs';
import {GraphqlCodeBlock} from 'graphql-syntax-highlighter-react';
import SyntaxHighlighter, {registerLanguage} from "react-syntax-highlighter/light"
import json from 'react-syntax-highlighter/languages/hljs/json';
import {githubGist} from 'react-syntax-highlighter/styles/hljs';

registerLanguage('json', json);

import './styles/react-tabs.scss';
import './styles/app.scss';


export default class App extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            query: 'query {graphQLHub}',
            response: '',
            showRight: false
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
            this.setState(() => {
                    return {
                        query: query,
                        showRight: true
                    }
                }
            );
            har.getContent(this.onContentLoaded.bind(this));
        } else {
            console.log("this is NOT graphql!");
        }
    }

    onRightPanelClose() {
        this.setState(() => {
                return {
                    showRight: false
                }
            }
        );
        this.table.resetSelection();
    }

    static hidden(isHidden) {
        return isHidden ? 'hide' : '';
    }

    render() {
        return <div className="flex-container">
            <div className="left">
                <Table
                    onRequestFinished={this.props.onRequestFinished}
                    onClick={this.onRowClick.bind(this)}
                    ref={(component) => { this.table = component; }}
                />
            </div>
            <div className={`right ${App.hidden(!this.state.showRight)}`}>
                <div className="close" onClick={this.onRightPanelClose.bind(this)}></div>
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
};
