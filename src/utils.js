function isString(str) {
    return (typeof str === 'string') || (str instanceof String);
}

function isObject(obj) {
    return (typeof obj === 'object' && (obj instanceof Object));
}

function toString(obj) {
    if (!isObject(obj)) return obj + '';

    var parts = [];
    for (var member in obj)
        parts.push(member + ': ' + toString(obj[member]));
    return parts.join(', ');
}

module.exports = {
    isString: isString,
    isObject: isObject,
    toString: toString
};
