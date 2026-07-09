const { specs: baseSpecs } = require('./swagger');

function buildPublicSwaggerSpec(baseSpec = baseSpecs) {
  const publicSpec = JSON.parse(JSON.stringify(baseSpec));

  publicSpec.info = {
    ...publicSpec.info,
    title: `${publicSpec.info?.title || 'API'} - External Partner API`,
    description: [
      publicSpec.info?.description?.trim() || '',
      '',
      'This document contains only the public/external integration endpoints intended for partner consumption.'
    ].filter(Boolean).join('\n')
  };

  const publicPaths = Object.entries(publicSpec.paths || {}).filter(([pathName]) =>
    pathName.startsWith('/external/')
  );

  publicSpec.paths = Object.fromEntries(publicPaths);

  const usedTags = Object.values(publicSpec.paths || {}).flatMap((pathItem) =>
    Object.values(pathItem || {}).flatMap((operation) => operation.tags || [])
  );

  const uniqueTags = [...new Set(usedTags)];
  publicSpec.tags = (publicSpec.tags || []).filter((tag) => uniqueTags.includes(tag.name));

  return publicSpec;
}

function buildPostmanCollection(publicSpec = publicSpecs) {
  const baseUrl = publicSpec.servers?.[0]?.url || '{{baseUrl}}';

  const collection = {
    info: {
      name: `${publicSpec.info?.title || 'External API'} Collection`,
      description: publicSpec.info?.description || '',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: []
  };

  for (const [pathName, pathItem] of Object.entries(publicSpec.paths || {})) {
    for (const [methodName, operation] of Object.entries(pathItem || {})) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(methodName)) {
        continue;
      }

      const request = {
        method: methodName.toUpperCase(),
        header: [],
        body: {
          mode: 'raw',
          raw: ''
        },
        url: {
          raw: `${baseUrl}${pathName}`,
          host: [baseUrl.replace(/^https?:\/\//, '')],
          path: pathName.split('/').filter(Boolean)
        },
        description: operation.description || operation.summary || ''
      };

      if (operation.security?.some((entry) => entry.ApiKeyAuth)) {
        request.header.push({
          key: 'X-API-Key',
          value: '{{x-api-key}}',
          type: 'text'
        });
      }

      collection.item.push({
        name: operation.summary || `${methodName.toUpperCase()} ${pathName}`,
        request,
        response: []
      });
    }
  }

  return collection;
}

const publicSpecs = buildPublicSwaggerSpec();

module.exports = {
  buildPublicSwaggerSpec,
  buildPostmanCollection,
  publicSpecs
};
