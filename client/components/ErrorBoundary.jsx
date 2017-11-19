import React from 'react';

import './styles/error_boundary.scss';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = ErrorBoundary.initialState();
    }

    static initialState() {
        return {
            hasError: false,
            errorMessage: ''
        }
    }

    componentDidCatch(error, info) {
        this.setState({
                hasError: true,
                errorMessage: error.message
            }
        );
    }

    reset() {
        this.setState(ErrorBoundary.initialState());
    }

    render() {
        if (this.state.hasError) {
            return <div className="errorBoundary">{this.state.errorMessage}</div>;
        }
        return this.props.children;
    }
}
