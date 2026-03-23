const ApiError = require("../utils/api-error");

const validateSegment = (segmentName, source, schema) => {
  if (!schema) {
    return source;
  }

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new ApiError(400, `${segmentName} payload must be an object`);
  }

  const fields = schema.fields || {};
  const validated = {};

  for (const [fieldName, rule] of Object.entries(fields)) {
    const parsedValue = rule(source[fieldName], fieldName);
    if (parsedValue !== undefined) {
      validated[fieldName] = parsedValue;
    }
  }

  if (schema.requireAtLeastOne && Object.keys(validated).length === 0) {
    throw new ApiError(400, `${segmentName} must include at least one valid field`);
  }

  if (schema.allowUnknown !== true) {
    const allowed = new Set(Object.keys(fields));
    const unknownKeys = Object.keys(source).filter((key) => !allowed.has(key));

    if (unknownKeys.length > 0) {
      throw new ApiError(400, `Unknown ${segmentName} fields: ${unknownKeys.join(", ")}`);
    }
  }

  return validated;
};

const validateRequest = ({ body, query, params } = {}) => {
  return (req, _res, next) => {
    try {
      if (params) {
        req.params = validateSegment("params", req.params || {}, params);
      }

      if (query) {
        req.query = validateSegment("query", req.query || {}, query);
      }

      if (body) {
        req.body = validateSegment("body", req.body || {}, body);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = validateRequest;
