module.exports = {
    isString: (str) => (typeof str === 'string') || (str instanceof String),

    isObject: (obj) => (typeof obj === 'object' && (obj instanceof Object)),

    toString: function (obj) {
        if (!this.isObject(obj))
            return `${obj}`;

        var parts = [];
        for (var member in obj)
            parts.push(`${member}: ${this.toString(obj[member])}`);

        return parts.join(', ');
    },
};
