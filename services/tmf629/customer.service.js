"use strict";

const cuid = require('cuid');

module.exports = {
  name: "tmf629.customer",
  version: 1,

  settings: {
    defaultPageSize: 20,
    maxPageSize: 100,
    baseUrl: process.env.API_BASE_URL || "http://localhost:3000"
  },

  dependencies: [],

  actions: {
    list: {
      scope: ["customer.list"],
      rest: {
        method: "GET",
        path: "/list"
      },
      cache: false,
      params: {
        fields: { type: "string", optional: true },
        offset: { type: "number", integer: true, min: 0, default: 0, optional: true, convert: true },
        limit: { type: "number", integer: true, min: 1, max: 100, default: 20, optional: true, convert: true },
        search: { type: "string", optional: true },
        searchFields: { type: "string", optional: true }
      },
      async handler(ctx) {
        const { fields, offset, limit, search, searchFields, ...filters } = ctx.params;
        const clientId = ctx.meta.clientId;

        if (search && !searchFields) {
          throw new Error("searchFields parameter is required when search parameter is provided", 400);
        }
        if (searchFields && !search) {
          throw new Error("search parameter is required when searchFields parameter is provided", 400);
        }

        const query = { clientId };
        Object.keys(filters).forEach(key => {
          if (filters[key] !== undefined) query[key] = filters[key];
        });

        if (search && searchFields) {
          const searchFieldList = searchFields.split(",").map(f => f.trim());
          const searchConditions = searchFieldList.map(field => ({
            [field]: { $regex: search, $options: "i" }
          }));
          query.$or = searchConditions;
        }

        const entities = await ctx.call("v1.db.customer.find", {
          query,
          offset,
          limit,
          sort: "-createdAt"
        });

        const populated = await Promise.all(
          entities.map(entity => this.populateCustomer(ctx, entity))
        );

        const total = await ctx.call("v1.db.customer.count", { query });

        let results = populated.map(entity => this.mapToSchema(entity));

        if (fields) {
          const fieldList = fields.split(",").map(f => f.trim());
          results = results.map(entity => this.filterFields(entity, fieldList));
        }

        return {
          data: results,
          meta: { total, offset, limit, hasMore: offset + limit < total }
        };
      }
    },

    create: {
      scope: ["customer.create"],
      rest: {
        method: "POST",
        path: "/create"
      },
      cache: false,
      params: {
        name: { type: "string" },
        engagedParty: { type: "object" },
        "@type": { type: "string", optional: true, default: "Customer" },
        "@baseType": { type: "string", optional: true },
        "@schemaLocation": { type: "string", optional: true },
        description: { type: "string", optional: true },
        role: { type: "string", optional: true },
        status: { type: "string", optional: true, default: "initialized" },
        statusReason: { type: "string", optional: true },
        validFor: { type: "object", optional: true },
        partyRoleSpecification: { type: "object", optional: true },
        characteristic: { type: "array", optional: true },
        account: { type: "array", optional: true },
        agreement: { type: "array", optional: true },
        contactMedium: { type: "array", optional: true },
        paymentMethod: { type: "array", optional: true },
        creditProfile: { type: "array", optional: true },
        relatedParty: { type: "array", optional: true }
      },
      async handler(ctx) {
        this.validateRequiredFields(ctx.params);

        const entityData = { ...ctx.params };
        const clientId = ctx.meta.clientId;

        const id = cuid();
        entityData.id = id;
        entityData.clientId = clientId;

        if (!entityData["@type"]) entityData["@type"] = "Customer";

        Object.keys(entityData).forEach(key => {
          if (entityData[key] === null) {
            entityData[key] = "null";
          }
        });

        const relatedEntities = {
          contactMedium: entityData.contactMedium,
          characteristic: entityData.characteristic,
          account: entityData.account,
          agreement: entityData.agreement,
          paymentMethod: entityData.paymentMethod,
          creditProfile: entityData.creditProfile,
          relatedParty: entityData.relatedParty
        };

        delete entityData.contactMedium;
        delete entityData.characteristic;
        delete entityData.account;
        delete entityData.agreement;
        delete entityData.paymentMethod;
        delete entityData.creditProfile;
        delete entityData.relatedParty;

        const created = await ctx.call("v1.db.customer.create", entityData);
        const entityId = created.id;

        created.href = `${this.settings.baseUrl}/api/v1/tmf629/customer/get/${entityId}`;
        await ctx.call("v1.db.customer.update", {
          id: entityId,
          clientId,
          href: created.href
        });

        try {
          if (relatedEntities.contactMedium && relatedEntities.contactMedium.length > 0) {
            const ids = await this.createContactMedium(ctx, relatedEntities.contactMedium, entityId, clientId);
            created.contactMedium = ids;
            await ctx.call("v1.db.customer.update", { id: entityId, clientId, contactMedium: ids });
          }

          if (relatedEntities.characteristic && relatedEntities.characteristic.length > 0) {
            const ids = await this.createCharacteristic(ctx, relatedEntities.characteristic, entityId, clientId);
            created.characteristic = ids;
            await ctx.call("v1.db.customer.update", { id: entityId, clientId, characteristic: ids });
          }

          if (relatedEntities.account && relatedEntities.account.length > 0) {
            const ids = await this.createAccount(ctx, relatedEntities.account, entityId, clientId);
            created.account = ids;
            await ctx.call("v1.db.customer.update", { id: entityId, clientId, account: ids });
          }

          if (relatedEntities.agreement && relatedEntities.agreement.length > 0) {
            const ids = await this.createAgreement(ctx, relatedEntities.agreement, entityId, clientId);
            created.agreement = ids;
            await ctx.call("v1.db.customer.update", { id: entityId, clientId, agreement: ids });
          }

          if (relatedEntities.paymentMethod && relatedEntities.paymentMethod.length > 0) {
            const ids = await this.createPaymentMethod(ctx, relatedEntities.paymentMethod, entityId, clientId);
            created.paymentMethod = ids;
            await ctx.call("v1.db.customer.update", { id: entityId, clientId, paymentMethod: ids });
          }

          if (relatedEntities.creditProfile && relatedEntities.creditProfile.length > 0) {
            const ids = await this.createCreditProfile(ctx, relatedEntities.creditProfile, entityId, clientId);
            created.creditProfile = ids;
            await ctx.call("v1.db.customer.update", { id: entityId, clientId, creditProfile: ids });
          }

          if (relatedEntities.relatedParty && relatedEntities.relatedParty.length > 0) {
            const ids = await this.createRelatedParty(ctx, relatedEntities.relatedParty, entityId, clientId);
            created.relatedParty = ids;
            await ctx.call("v1.db.customer.update", { id: entityId, clientId, relatedParty: ids });
          }

          const updatedEntity = await ctx.call("v1.db.customer.get", { id: entityId, clientId });
          const populated = await this.populateCustomer(ctx, updatedEntity);
          const schemaFiltered = this.mapToSchema(populated);

          await ctx.call("v1.tmf629.event-publisher.publish", {
            eventType: "CustomerCreateEvent",
            event: {
              eventType: "CustomerCreateEvent",
              eventTime: new Date().toISOString(),
              event: { customer: schemaFiltered }
            }
          });

          return schemaFiltered;

        } catch (error) {
          await ctx.call("v1.db.customer.remove", { id: entityId, clientId });
          throw error;
        }
      }
    },

    get: {
      scope: ["customer.get"],
      rest: {
        method: "GET",
        path: "/get/:id"
      },
      cache: false,
      params: {
        id: { type: "string" },
        fields: { type: "string", optional: true }
      },
      async handler(ctx) {
        const { id, fields } = ctx.params;
        const clientId = ctx.meta.clientId;

        if (!id || id.trim() === "") {
          throw new Error("ID is required", 400);
        }

        const entity = await ctx.call("v1.db.customer.get", { id, clientId });
        if (!entity) {
          throw new Error(`Customer with id ${id} not found`, 404);
        }

        const populated = await this.populateCustomer(ctx, entity);
        let result = this.mapToSchema(populated);

        if (fields) {
          const fieldList = fields.split(",").map(f => f.trim());
          result = this.filterFields(result, fieldList);
        }

        return result;
      }
    },

    patch: {
      scope: ["customer.patch"],
      rest: {
        method: "PATCH",
        path: "/patch/:id"
      },
      cache: false,
      params: {
        id: { type: "string" }
      },
      async handler(ctx) {
        const { id } = ctx.params;
        const clientId = ctx.meta.clientId;

        if (!id || id.trim() === "") {
          throw new Error("ID is required", 400);
        }

        const existing = await ctx.call("v1.db.customer.get", { id, clientId });
        if (!existing) {
          throw new Error(`Customer with id ${id} not found`, 404);
        }

        const populatedExisting = await this.populateCustomer(ctx, existing);

        const body = ctx.params;
        const patchOperations = body.operations || body.patchOperations;
        
        let changedAttributes = [];
        let updatedResource;

        if (Array.isArray(patchOperations)) {
          updatedResource = await this.applyJsonPatchQuery(ctx, populatedExisting, patchOperations, clientId);
          changedAttributes = this.extractChangedAttributesFromOperations(patchOperations);
        } else {
          const { id: _id, operations, patchOperations: _patchOps, ...updates } = body;
          
          if (Object.keys(updates).length === 0) {
            throw new Error("No update data provided. Use 'operations' array for JSON Patch Query or provide fields directly for merge patch.", 400);
          }
          
          updatedResource = await this.applyMergePatch(ctx, existing, updates, clientId);
          changedAttributes = Object.keys(updates);
        }

        const finalEntity = await ctx.call("v1.db.customer.get", { id, clientId });
        const populated = await this.populateCustomer(ctx, finalEntity);
        const schemaFiltered = this.mapToSchema(populated);

        const statusChanged = updatedResource.status !== undefined && 
                              updatedResource.status !== existing.status;
        const eventType = statusChanged
          ? "CustomerStateChangeEvent"
          : "CustomerAttributeValueChangeEvent";

        await ctx.call("v1.tmf629.event-publisher.publish", {
          eventType,
          event: {
            eventType,
            eventTime: new Date().toISOString(),
            event: { customer: schemaFiltered, changedAttributes }
          }
        });

        return schemaFiltered;
      }
    },

    remove: {
      scope: ["customer.remove"],
      rest: {
        method: "DELETE",
        path: "/remove/:id"
      },
      cache: false,
      params: {
        id: { type: "string" }
      },
      async handler(ctx) {
        const { id } = ctx.params;
        const clientId = ctx.meta.clientId;

        if (!id || id.trim() === "") {
          throw new Error("ID is required", 400);
        }

        const entity = await ctx.call("v1.db.customer.get", { id, clientId });
        if (!entity) {
          throw new Error(`Customer with id ${id} not found`, 404);
        }

        await this.deleteRelatedEntities(ctx, entity, clientId);
        await ctx.call("v1.db.customer.remove", { id, clientId });

        await ctx.call("v1.tmf629.event-publisher.publish", {
          eventType: "CustomerDeleteEvent",
          event: {
            eventType: "CustomerDeleteEvent",
            eventTime: new Date().toISOString(),
            event: {
              customer: {
                id: entity.id,
                href: entity.href,
                name: entity.name,
                "@type": "Customer"
              }
            }
          }
        });

        return null;
      }
    }
  },

  methods: {
    async applyJsonPatchQuery(ctx, entity, operations, clientId) {
      const entityId = entity.id;
      let workingEntity = JSON.parse(JSON.stringify(entity));
      
      for (const operation of operations) {
        if (!operation.op) {
          throw new Error("Each operation must have an 'op' field", 400);
        }
        if (!['add', 'remove', 'replace'].includes(operation.op)) {
          throw new Error(`Unsupported operation: ${operation.op}. Supported: add, remove, replace`, 400);
        }
        if (!operation.path) {
          throw new Error("Each operation must have a 'path' field", 400);
        }
        if (operation.op !== 'remove' && operation.value === undefined) {
          throw new Error(`Operation '${operation.op}' requires a 'value' field`, 400);
        }
      }

      for (const operation of operations) {
        workingEntity = await this.applyPatchOperation(ctx, workingEntity, operation, clientId);
      }

      return workingEntity;
    },

    async applyPatchOperation(ctx, entity, operation, clientId) {
      const { op, path, value } = operation;
      const entityId = entity.id;

      const pathInfo = this.parseJsonPath(path);
      
      if (!pathInfo) {
        throw new Error(`Invalid path format: ${path}`, 400);
      }

      const { arrayName, filterCondition, targetAttribute, isArrayOperation } = pathInfo;

      if (!isArrayOperation) {
        return await this.applySimpleOperation(ctx, entity, op, pathInfo.attributeName, value, clientId);
      }

      const relatedEntityTypes = [
        'contactMedium', 'characteristic', 'account', 'agreement',
        'paymentMethod', 'creditProfile', 'relatedParty'
      ];

      if (!relatedEntityTypes.includes(arrayName)) {
        throw new Error(`Unknown array: ${arrayName}`, 400);
      }

      const arrayData = entity[arrayName] || [];
      
      const matchingIndices = this.findMatchingElements(arrayData, filterCondition);

      if (matchingIndices.length === 0 && op !== 'add') {
        throw new Error(`No elements match the filter condition: ${filterCondition}`, 404);
      }

      switch (op) {
        case 'add':
          return await this.handleAddOperation(ctx, entity, arrayName, filterCondition, targetAttribute, value, clientId);
        
        case 'remove':
          return await this.handleRemoveOperation(ctx, entity, arrayName, matchingIndices, targetAttribute, clientId);
        
        case 'replace':
          return await this.handleReplaceOperation(ctx, entity, arrayName, matchingIndices, targetAttribute, value, clientId);
        
        default:
          throw new Error(`Unsupported operation: ${op}`, 400);
      }
    },

    parseJsonPath(path) {
      const arrayIndexRegex = /^\$\.(\w+)\[(\d+)\](?:\.(.+))?$/;
      let match = path.match(arrayIndexRegex);
      
      if (match) {
        return {
          isArrayOperation: true,
          arrayName: match[1],
          filterCondition: { index: parseInt(match[2], 10) },
          targetAttribute: match[3] || null
        };
      }

      const jsonPathRegex = /^\$\.(\w+)\[\?\(@\.(\w+)==['"](.*)['"]\)\](?:\.(.+))?$/;
      match = path.match(jsonPathRegex);
      
      if (match) {
        return {
          isArrayOperation: true,
          arrayName: match[1],
          filterCondition: { field: match[2], value: match[3] },
          targetAttribute: match[4] || null
        };
      }

      const complexJsonPathRegex = /^\$\.(\w+)\[\?\(@\.([^=]+)==['"](.*)['"]\)\](?:\.(.+))?$/;
      match = path.match(complexJsonPathRegex);
      
      if (match) {
        return {
          isArrayOperation: true,
          arrayName: match[1],
          filterCondition: { field: match[2], value: match[3] },
          targetAttribute: match[4] || null
        };
      }

      const multiConditionRegex = /^\$\.(\w+)\[\?\((.+)\)\](?:\.(.+))?$/;
      match = path.match(multiConditionRegex);
      
      if (match) {
        const conditions = this.parseMultipleConditions(match[2]);
        return {
          isArrayOperation: true,
          arrayName: match[1],
          filterCondition: conditions,
          targetAttribute: match[3] || null
        };
      }

      const dotNotationRegex = /^\/(\w+)(?:\/(\w+))?\?(.+)$/;
      match = path.match(dotNotationRegex);
      
      if (match) {
        const conditions = this.parseDotNotationConditions(match[3]);
        return {
          isArrayOperation: true,
          arrayName: match[1],
          filterCondition: conditions,
          targetAttribute: match[2] || null
        };
      }

      const filterSelectorRegex = /^\?filter=(\w+)\[\?\(@\.(\w+)==['"](.*)['"]\)\](?:\.(.+))?$/;
      match = path.match(filterSelectorRegex);
      
      if (match) {
        return {
          isArrayOperation: true,
          arrayName: match[1],
          filterCondition: { field: match[2], value: match[3] },
          targetAttribute: match[4] || null
        };
      }

      const nestedAttrRegex = /^\$\.(\w+(?:\.\w+)+)$/;
      match = path.match(nestedAttrRegex);
      
      if (match) {
        return {
          isArrayOperation: false,
          attributeName: match[1],
          isNested: true
        };
      }

      const simpleAttrRegex = /^(?:\/|\$\.)(\w+)$/;
      match = path.match(simpleAttrRegex);
      
      if (match) {
        return {
          isArrayOperation: false,
          attributeName: match[1]
        };
      }

      return null;
    },

    parseMultipleConditions(conditionString) {
      const conditions = [];
      const parts = conditionString.split(/\s*&&\s*/);
      
      for (const part of parts) {
        const match = part.match(/@\.([^=]+)==['"](.*)['"]$/);
        if (match) {
          conditions.push({ field: match[1].trim(), value: match[2] });
        }
      }
      
      return conditions.length === 1 ? conditions[0] : conditions;
    },

    parseDotNotationConditions(conditionString) {
      const conditions = [];
      const parts = conditionString.split('&');
      
      for (const part of parts) {
        const [fieldPath, value] = part.split('=');
        const field = fieldPath.includes('.') 
          ? fieldPath.split('.').slice(1).join('.')
          : fieldPath;
        conditions.push({ field, value });
      }
      
      return conditions.length === 1 ? conditions[0] : conditions;
    },

    findMatchingElements(array, filterCondition) {
      if (!Array.isArray(array)) return [];
      
      if (filterCondition && typeof filterCondition.index === 'number') {
        const index = filterCondition.index;
        if (index >= 0 && index < array.length) {
          return [index];
        }
        return [];
      }
      
      const conditions = Array.isArray(filterCondition) ? filterCondition : [filterCondition];
      
      return array.reduce((indices, element, index) => {
        const matches = conditions.every(condition => {
          const fieldValue = this.getNestedValue(element, condition.field);
          return String(fieldValue) === String(condition.value);
        });
        
        if (matches) indices.push(index);
        return indices;
      }, []);
    },

    getNestedValue(obj, path) {
      if (!obj || !path) return undefined;
      
      const parts = path.split('.');
      let current = obj;
      
      for (const part of parts) {
        if (current === undefined || current === null) return undefined;
        current = current[part];
      }
      
      return current;
    },

    setNestedValue(obj, path, value) {
      const parts = path.split('.');
      let current = obj;
      
      for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] === undefined) {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      
      current[parts[parts.length - 1]] = value;
    },

    deleteNestedValue(obj, path) {
      const parts = path.split('.');
      let current = obj;
      
      for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] === undefined) {
          return;
        }
        current = current[parts[i]];
      }
      
      delete current[parts[parts.length - 1]];
    },

    async handleAddOperation(ctx, entity, arrayName, filterCondition, targetAttribute, value, clientId) {
      const entityId = entity.id;
      const dbName = this.getDbName(arrayName);
      const arrayData = entity[arrayName] || [];

      if (targetAttribute) {
        const matchingIndices = this.findMatchingElements(arrayData, filterCondition);
        
        if (matchingIndices.length === 0) {
          throw new Error(`No elements match the filter condition to add attribute`, 404);
        }

        for (const index of matchingIndices) {
          const element = arrayData[index];
          if (element && element.id) {
            const existingRecord = await ctx.call(`v1.db.${dbName}.get`, { 
              id: element.id, 
              clientId 
            }).catch(() => null);

            if (existingRecord) {
              const updateData = { id: element.id, clientId };
              
              if (targetAttribute.includes('.')) {
                const parts = targetAttribute.split('.');
                const topLevelKey = parts[0];
                const existingTopLevel = element[topLevelKey] || {};
                
                let nestedObj = JSON.parse(JSON.stringify(existingTopLevel));
                this.setNestedValue({ [topLevelKey]: nestedObj }, targetAttribute, value);
                
                updateData[topLevelKey] = nestedObj;
                
                await ctx.call(`v1.db.${dbName}.update`, updateData);
                
                if (!arrayData[index][topLevelKey]) {
                  arrayData[index][topLevelKey] = {};
                }
                this.setNestedValue(arrayData[index], targetAttribute, value);
              } else if (typeof value === 'object' && !Array.isArray(value)) {
                Object.assign(updateData, value);
                await ctx.call(`v1.db.${dbName}.update`, updateData);
                arrayData[index][targetAttribute] = { ...arrayData[index][targetAttribute], ...value };
              } else {
                updateData[targetAttribute] = value;
                await ctx.call(`v1.db.${dbName}.update`, updateData);
                arrayData[index][targetAttribute] = value;
              }
            }
          }
        }
      } else {
        const createMethod = `create${arrayName.charAt(0).toUpperCase() + arrayName.slice(1)}`;
        
        if (typeof this[createMethod] === 'function') {
          const newItems = Array.isArray(value) ? value : [value];
          const newIds = await this[createMethod](ctx, newItems, entityId, clientId);
          
          const existingIds = await ctx.call("v1.db.customer.get", { id: entityId, clientId })
            .then(e => e[arrayName] || []);
          const allIds = [...existingIds, ...newIds];
          
          await ctx.call("v1.db.customer.update", {
            id: entityId,
            clientId,
            [arrayName]: allIds
          });
        }
      }

      entity[arrayName] = arrayData;
      return entity;
    },

    async handleRemoveOperation(ctx, entity, arrayName, matchingIndices, targetAttribute, clientId) {
      const entityId = entity.id;
      const dbName = this.getDbName(arrayName);
      const arrayData = entity[arrayName] || [];

      if (targetAttribute) {
        for (const index of matchingIndices) {
          const element = arrayData[index];
          if (element && element.id) {
            const existingRecord = await ctx.call(`v1.db.${dbName}.get`, { 
              id: element.id, 
              clientId 
            }).catch(() => null);

            if (existingRecord) {
              if (targetAttribute.includes('.')) {
                const parts = targetAttribute.split('.');
                const topLevelKey = parts[0];
                const existingTopLevel = element[topLevelKey] || {};
                
                let nestedObj = JSON.parse(JSON.stringify(existingTopLevel));
                this.deleteNestedValue(nestedObj, parts.slice(1).join('.'));
                
                await ctx.call(`v1.db.${dbName}.update`, {
                  id: element.id,
                  clientId,
                  [topLevelKey]: nestedObj
                });
                
                this.deleteNestedValue(arrayData[index], targetAttribute);
              } else {
                await ctx.call(`v1.db.${dbName}.update`, {
                  id: element.id,
                  clientId,
                  [targetAttribute]: null
                });
                
                delete arrayData[index][targetAttribute];
              }
            }
          }
        }
      } else {
        const idsToRemove = matchingIndices.map(i => arrayData[i]?.id).filter(Boolean);
        
        for (const relId of idsToRemove) {
          await ctx.call(`v1.db.${dbName}.remove`, { id: relId, clientId }).catch(() => {});
        }
        
        const existingEntity = await ctx.call("v1.db.customer.get", { id: entityId, clientId });
        const remainingIds = (existingEntity[arrayName] || []).filter(id => !idsToRemove.includes(id));
        
        await ctx.call("v1.db.customer.update", {
          id: entityId,
          clientId,
          [arrayName]: remainingIds
        });
        
        entity[arrayName] = arrayData.filter((_, i) => !matchingIndices.includes(i));
      }

      return entity;
    },

    async handleReplaceOperation(ctx, entity, arrayName, matchingIndices, targetAttribute, value, clientId) {
      const entityId = entity.id;
      const dbName = this.getDbName(arrayName);
      const arrayData = entity[arrayName] || [];

      if (targetAttribute) {
        for (const index of matchingIndices) {
          const element = arrayData[index];
          if (element && element.id) {
            const updateData = {
              id: element.id,
              clientId
            };
            
            if (targetAttribute.includes('.')) {
              const parts = targetAttribute.split('.');
              const topLevelKey = parts[0];
              const existingTopLevel = element[topLevelKey] || {};
              
              let nestedObj = JSON.parse(JSON.stringify(existingTopLevel));
              this.setNestedValue({ [topLevelKey]: nestedObj }, targetAttribute, value);
              
              updateData[topLevelKey] = nestedObj;
              
              await ctx.call(`v1.db.${dbName}.update`, updateData);
              
              this.setNestedValue(arrayData[index], targetAttribute, value);
            } else {
              updateData[targetAttribute] = value;
              await ctx.call(`v1.db.${dbName}.update`, updateData);
              arrayData[index][targetAttribute] = value;
            }
          }
        }
      } else {
        for (const index of matchingIndices) {
          const element = arrayData[index];
          if (element && element.id) {
            await ctx.call(`v1.db.${dbName}.update`, {
              id: element.id,
              clientId,
              ...value
            });
            
            arrayData[index] = { ...value, id: element.id };
          }
        }
      }

      entity[arrayName] = arrayData;
      return entity;
    },

    async applySimpleOperation(ctx, entity, op, attributeName, value, clientId) {
      const entityId = entity.id;
      const nonPatchableFields = ["id", "href", "@type"];
      
      if (nonPatchableFields.includes(attributeName)) {
        throw new Error(`Cannot modify field: ${attributeName}`, 400);
      }

      switch (op) {
        case 'add':
        case 'replace':
          await ctx.call("v1.db.customer.update", {
            id: entityId,
            clientId,
            [attributeName]: value
          });
          entity[attributeName] = value;
          break;
        
        case 'remove':
          await ctx.call("v1.db.customer.update", {
            id: entityId,
            clientId,
            [attributeName]: null
          });
          delete entity[attributeName];
          break;
      }

      return entity;
    },

    async applyMergePatch(ctx, existing, updates, clientId) {
      const entityId = existing.id;
      
      this.validatePatchableFields(updates);

      Object.keys(updates).forEach(key => {
        if (updates[key] === null) {
          updates[key] = "null";
        }
      });

      const relatedEntityTypes = [
        'contactMedium', 'characteristic', 'account', 'agreement',
        'paymentMethod', 'creditProfile', 'relatedParty'
      ];

      for (const relationType of relatedEntityTypes) {
        if (updates[relationType] && Array.isArray(updates[relationType])) {
          const existingIds = existing[relationType] || [];
          const dbName = this.getDbName(relationType);
          
          await Promise.all(
            existingIds.map(relId =>
              ctx.call(`v1.db.${dbName}.remove`, { id: relId, clientId }).catch(() => {})
            )
          );

          const createMethod = `create${relationType.charAt(0).toUpperCase() + relationType.slice(1)}`;
          if (typeof this[createMethod] === 'function') {
            const newIds = await this[createMethod](ctx, updates[relationType], entityId, clientId);
            updates[relationType] = newIds;
          }
        }
      }

      await ctx.call("v1.db.customer.update", {
        id: entityId,
        clientId,
        ...updates,
        updatedAt: new Date().toISOString()
      });

      return updates;
    },

    extractChangedAttributesFromOperations(operations) {
      const attributes = new Set();
      
      for (const op of operations) {
        const pathInfo = this.parseJsonPath(op.path);
        if (pathInfo) {
          if (pathInfo.isArrayOperation) {
            attributes.add(pathInfo.arrayName);
          } else {
            attributes.add(pathInfo.attributeName);
          }
        }
      }
      
      return Array.from(attributes);
    },

    getDbName(relationType) {
      const dbNameMap = {
        contactMedium: 'contact_medium',
        characteristic: 'characteristic',
        account: 'account_ref',
        agreement: 'agreement_ref',
        paymentMethod: 'payment_method_ref',
        creditProfile: 'credit_profile',
        relatedParty: 'related_party'
      };
      return dbNameMap[relationType] || relationType;
    },

    async populateCustomer(ctx, entity) {
      const populated = { ...entity };
      const clientId = ctx.meta.clientId;

      if (entity.contactMedium && entity.contactMedium.length > 0) {
        const contacts = await Promise.all(
          entity.contactMedium.map(id =>
            ctx.call("v1.db.contact_medium.get", { id, clientId }).catch(() => null)
          )
        );
        const contactSchema = ['id', 'preferred', 'contactType', 'validFor', 'emailAddress', 'phoneNumber', 'faxNumber', 'socialNetworkId', 'city', 'country', 'postCode', 'stateOrProvince', 'street1', 'street2', 'geographicAddress', '@type', '@baseType', '@schemaLocation'];
        populated.contactMedium = contacts.filter(c => c).map(c => this.cleanEntity(c, contactSchema));
      }

      if (entity.characteristic && entity.characteristic.length > 0) {
        const chars = await Promise.all(
          entity.characteristic.map(id =>
            ctx.call("v1.db.characteristic.get", { id, clientId }).catch(() => null)
          )
        );
        const charSchema = ['id', 'name', 'valueType', 'value', 'characteristicRelationship', '@type', '@baseType', '@schemaLocation'];
        populated.characteristic = chars.filter(c => c).map(c => this.cleanEntity(c, charSchema));
      }

      if (entity.account && entity.account.length > 0) {
        const accounts = await Promise.all(
          entity.account.map(id =>
            ctx.call("v1.db.account_ref.get", { id, clientId }).catch(() => null)
          )
        );
        const accountSchema = ['id', 'href', 'name', '@type', '@baseType', '@schemaLocation', '@referredType'];
        populated.account = accounts.filter(a => a).map(a => this.cleanEntity(a, accountSchema));
      }

      if (entity.agreement && entity.agreement.length > 0) {
        const agreements = await Promise.all(
          entity.agreement.map(id =>
            ctx.call("v1.db.agreement_ref.get", { id, clientId }).catch(() => null)
          )
        );
        const agreementSchema = ['id', 'href', 'name', '@type', '@baseType', '@schemaLocation', '@referredType'];
        populated.agreement = agreements.filter(a => a).map(a => this.cleanEntity(a, agreementSchema));
      }

      if (entity.paymentMethod && entity.paymentMethod.length > 0) {
        const paymentMethods = await Promise.all(
          entity.paymentMethod.map(id =>
            ctx.call("v1.db.payment_method_ref.get", { id, clientId }).catch(() => null)
          )
        );
        const paymentSchema = ['id', 'href', 'name', '@type', '@baseType', '@schemaLocation', '@referredType'];
        populated.paymentMethod = paymentMethods.filter(p => p).map(p => this.cleanEntity(p, paymentSchema));
      }

      if (entity.creditProfile && entity.creditProfile.length > 0) {
        const creditProfiles = await Promise.all(
          entity.creditProfile.map(id =>
            ctx.call("v1.db.credit_profile.get", { id, clientId }).catch(() => null)
          )
        );
        const creditSchema = ['id', 'creditProfileDate', 'creditRiskRating', 'creditScore', 'validFor', '@type', '@baseType', '@schemaLocation'];
        populated.creditProfile = creditProfiles.filter(c => c).map(c => this.cleanEntity(c, creditSchema));
      }

      if (entity.relatedParty && entity.relatedParty.length > 0) {
        const parties = await Promise.all(
          entity.relatedParty.map(id =>
            ctx.call("v1.db.related_party.get", { id, clientId }).catch(() => null)
          )
        );
        const partySchema = ['id', 'role', 'partyOrPartyRole', '@type', '@baseType', '@schemaLocation'];
        populated.relatedParty = parties.filter(p => p).map(p => this.cleanEntity(p, partySchema));
      }

      return populated;
    },

    async createContactMedium(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.contact_medium.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "ContactMedium"
        });
        ids.push(id);
      }
      return ids;
    },

    async createCharacteristic(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.characteristic.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "Characteristic"
        });
        ids.push(id);
      }
      return ids;
    },

    async createAccount(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.account_ref.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "AccountRef"
        });
        ids.push(id);
      }
      return ids;
    },

    async createAgreement(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.agreement_ref.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "AgreementRef"
        });
        ids.push(id);
      }
      return ids;
    },

    async createPaymentMethod(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.payment_method_ref.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "PaymentMethodRef"
        });
        ids.push(id);
      }
      return ids;
    },

    async createCreditProfile(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.credit_profile.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "CreditProfile"
        });
        ids.push(id);
      }
      return ids;
    },

    async createRelatedParty(ctx, items, parentId, clientId) {
      const ids = [];
      for (const item of items) {
        const id = cuid();
        await ctx.call("v1.db.related_party.create", {
          id,
          clientId,
          parentId,
          ...item,
          "@type": item["@type"] || "RelatedPartyOrPartyRole"
        });
        ids.push(id);
      }
      return ids;
    },

    async deleteRelatedEntities(ctx, entity, clientId) {
      const relatedEntityTypes = [
        { field: 'contactMedium', db: 'contact_medium' },
        { field: 'characteristic', db: 'characteristic' },
        { field: 'account', db: 'account_ref' },
        { field: 'agreement', db: 'agreement_ref' },
        { field: 'paymentMethod', db: 'payment_method_ref' },
        { field: 'creditProfile', db: 'credit_profile' },
        { field: 'relatedParty', db: 'related_party' }
      ];

      for (const { field, db } of relatedEntityTypes) {
        if (entity[field] && entity[field].length > 0) {
          await Promise.all(
            entity[field].map(id =>
              ctx.call(`v1.db.${db}.remove`, { id, clientId }).catch(() => {})
            )
          );
        }
      }
    },

    mapToSchema(data) {
      const schemaFields = [
        'id', 'href', 'name', 'description', 'role', 'status', 'statusReason', 'validFor',
        'engagedParty', 'partyRoleSpecification', 'characteristic', 'account', 'agreement',
        'contactMedium', 'paymentMethod', 'creditProfile', 'relatedParty',
        '@type', '@baseType', '@schemaLocation'
      ];
      const mapped = {};

      if (data.id !== undefined && data.id !== null && data.id !== "null" && data.id !== "") mapped.id = data.id;
      if (data.href !== undefined && data.href !== null && data.href !== "null" && data.href !== "") mapped.href = data.href;

      schemaFields.forEach(field => {
        if (field !== 'id' && field !== 'href') {
          const value = data[field];
          if (value !== undefined && value !== null && value !== "null" && value !== "" &&
              !(Array.isArray(value) && value.length === 0)) {
            mapped[field] = value;
          }
        }
      });

      return mapped;
    },

    cleanEntity(entity, schemaFields) {
      if (!entity) return null;

      const cleaned = {};

      if (entity.id !== undefined && entity.id !== null && entity.id !== "null" && entity.id !== "") cleaned.id = entity.id;
      if (entity.href !== undefined && entity.href !== null && entity.href !== "null" && entity.href !== "") cleaned.href = entity.href;

      schemaFields.forEach(field => {
        if (field !== 'id' && field !== 'href') {
          const value = entity[field];
          if (value !== undefined && value !== null && value !== "null" && value !== "" &&
              !(Array.isArray(value) && value.length === 0)) {
            cleaned[field] = value;
          }
        }
      });

      return cleaned;
    },

    validateRequiredFields(data) {
      const requiredFields = ['name', 'engagedParty'];
      const missingFields = requiredFields.filter(field => !data[field] || (typeof data[field] === 'string' && data[field].trim() === ""));

      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(", ")}`, 400);
      }
    },

    validatePatchableFields(updates) {
      const nonPatchableFields = ["id", "href", "@type"];
      const invalidFields = Object.keys(updates).filter(field => nonPatchableFields.includes(field));

      if (invalidFields.length > 0) {
        throw new Error(`Cannot update non-patchable fields: ${invalidFields.join(", ")}`, 400);
      }
    },

    filterFields(obj, fields) {
      const filtered = {};

      if (obj.id !== undefined && obj.id !== null) filtered.id = obj.id;
      if (obj.href !== undefined && obj.href !== null) filtered.href = obj.href;

      fields.forEach(field => {
        if (field !== 'id' && field !== 'href' && obj.hasOwnProperty(field) && obj[field] !== null && obj[field] !== "null") {
          filtered[field] = obj[field];
        }
      });

      if (obj["@type"] !== undefined && obj["@type"] !== null) filtered["@type"] = obj["@type"];

      return filtered;
    }
  },

  started() {
    this.logger.info("Customer service started");
  }
};
