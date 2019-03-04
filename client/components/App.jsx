import React from 'react';
import ErrorBoundary from './ErrorBoundary';
import Table from './Table';
import HarDetails from './HarDetails';
import HarUtils from '../services/HarUtils';
import {Tab, Tabs, TabList, TabPanel} from 'react-tabs';
import {GraphqlCodeBlock} from 'graphql-syntax-highlighter-react';
import json from 'react-syntax-highlighter/languages/hljs/json';
import {githubGist} from 'react-syntax-highlighter/styles/hljs';
import ReactJson from 'react-json-view'


import './styles/react-tabs.scss';
import './styles/app.scss';


export default class App extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            har: null,
            query: 'query {graphQLHub}',
            variables: {},
            response: {},
            showRight: false
        };
        this.errorBoundaries = new Set();
        this.table = null;
    }

    onContentLoaded(index, content) {
        try {
            const data = JSON.parse(content);
            const response = Array.isArray(data) ? data[index] : data;
            this.setState({response: response});
        } catch (e) {
            if (e instanceof SyntaxError) {
            } else throw e
        }
    }

    resetErrorBoundaries() {
        this.errorBoundaries.forEach(errorBoundary => {
            if (errorBoundary !== null && typeof errorBoundary.reset === 'function') {
                errorBoundary.reset();
            }
        });
    }

    onRowClick(har) {
        this.resetErrorBoundaries();
        const query = HarUtils.getGraphQLQueries(har)[0];
        if (query !== null && typeof query.query !== 'undefined') {
            this.setState({
                har: har,
                query: query.query,
                variables: query.variables,
                showRight: true
            });
            har.getContent(this.onContentLoaded.bind(this, har.operationIndex));
        }
    }

    onRightPanelClose() {
        this.setState({
            showRight: false
        });
        if (this.table) {
            this.table.resetSelection();
        }
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
                    ref={(component) => {
                        this.table = component;
                    }}
                />
            </div>
            <div className={`right ${App.hidden(!this.state.showRight)}`}>
                <div className="close" onClick={this.onRightPanelClose.bind(this)}></div>
                <Tabs>
                    <TabList>
                        <Tab>Query</Tab>
                        <Tab>Variables</Tab>
                        <Tab>Response</Tab>
                        <Tab>Details</Tab>
                    </TabList>
                    <TabPanel>
                        <ErrorBoundary ref={eb => this.errorBoundaries.add(eb)}>
                            <GraphqlCodeBlock
                                className="GraphqlCodeBlock"
                                queryBody={this.state.query}
                            />
                        </ErrorBoundary>
                    </TabPanel>
                    <TabPanel>
                        <ErrorBoundary ref={eb => this.errorBoundaries.add(eb)}>
                            <ReactJson name={null} src={this.state.variables} />
                        </ErrorBoundary>
                    </TabPanel>
                    <TabPanel>
                        <ErrorBoundary ref={eb => this.errorBoundaries.add(eb)}>
                            <ReactJson name={null} src={this.state.response} />
                        </ErrorBoundary>
                    </TabPanel>
                    <TabPanel>
                        <ErrorBoundary ref={eb => this.errorBoundaries.add(eb)}>
                            <HarDetails har={this.state.har}/>
                        </ErrorBoundary>
                    </TabPanel>
                </Tabs>
            </div>
        </div>;
    }
};
