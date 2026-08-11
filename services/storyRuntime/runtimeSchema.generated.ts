// 由 scripts/story-runtime-instance-validator-regression.mjs 从
// scripts/fixtures/story-v3/story-runtime-contract.fixture.json 生成（contractRevision 2）
// fixture fingerprint: sha256:f19a297c9176d5fe84e79c95135ecc92ea2155b696c123820bd7b8b0b8755bf6
// 本文件只保存校验所需的 schema 投影；不保存 lifecycle/defaults/compatibility，不生成 domain 默认值，
// 不 import fixture JSON，不被现有运行流程 import。

export const storyRuntimeSchemaV3 = {
  "contractRevision": 2,
  "fixtureFingerprint": "sha256:f19a297c9176d5fe84e79c95135ecc92ea2155b696c123820bd7b8b0b8755bf6",
  "generatorVersion": 1,
  "types": {
    "StoryRuntimeState": {
      "kind": "interface",
      "fields": {
        "schemaVersion": {
          "type": "literal",
          "required": true,
          "value": 3
        },
        "runtimeBranchId": {
          "type": "string",
          "required": true
        },
        "saveNodeId": {
          "type": "string",
          "required": true
        },
        "assetCatalogFingerprint": {
          "type": "string",
          "required": true
        },
        "runtimeRevision": {
          "type": "number",
          "required": true
        },
        "turnCount": {
          "type": "number",
          "required": true
        },
        "lastCommittedTurnId": {
          "type": "string",
          "required": false
        },
        "gameClock": {
          "type": "ref",
          "required": true,
          "to": "GameClock"
        },
        "activeTrackId": {
          "type": "string",
          "required": false
        },
        "focus": {
          "type": "ref",
          "required": true,
          "to": "StoryFocus"
        },
        "playerPlanPool": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "PlayerPlanItem"
          }
        },
        "worldPlanPool": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "WorldPlanItem"
          }
        },
        "convergenceQueue": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "ConvergenceItem"
          }
        },
        "worldEvents": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "WorldEventInstance"
          }
        },
        "entities": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "WorldEntityState"
          }
        },
        "factLedger": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "CommittedWorldFact"
          }
        },
        "publicSchedules": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "PublicSchedule"
          }
        },
        "officialNotices": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "OfficialNotice"
          }
        },
        "knowledgeGrants": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "KnowledgeGrant"
          }
        },
        "commandIdempotencyIndex": {
          "type": "map",
          "required": true,
          "value": {
            "type": "object",
            "fields": {
              "commandFingerprint": {
                "type": "string",
                "required": true
              },
              "resultRevision": {
                "type": "number",
                "required": true
              },
              "resultCode": {
                "type": "string",
                "required": true
              },
              "receiptId": {
                "type": "string",
                "required": true
              },
              "resultHash": {
                "type": "string",
                "required": true
              },
              "resultRef": {
                "type": "object",
                "required": true,
                "fields": {
                  "saveNodeId": {
                    "type": "string",
                    "required": true
                  },
                  "stateFingerprint": {
                    "type": "string",
                    "required": true
                  }
                }
              }
            }
          },
          "key": {
            "type": "string"
          }
        },
        "turnReceipts": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "TurnAdjudicationReceipt"
          }
        },
        "narrativePublications": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "NarrativePublicationRecord"
          }
        },
        "migration": {
          "type": "ref",
          "required": true,
          "to": "RuntimeMigrationMeta"
        }
      }
    },
    "StoryRuntimeView": {
      "kind": "interface",
      "fields": {
        "core": {
          "type": "ref",
          "required": true,
          "to": "StoryRuntimeState"
        },
        "projections": {
          "type": "ref",
          "required": true,
          "to": "StoryProjectionState"
        },
        "outbox": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "ProjectionOutboxItem"
          }
        }
      }
    },
    "StoryProjectionState": {
      "kind": "interface",
      "fields": {
        "runtimeBranchId": {
          "type": "string",
          "required": true
        },
        "newsArticles": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "NewsArticleAggregate"
          }
        },
        "knowledgeReceipts": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "KnowledgeReceipt"
          }
        },
        "observerReadCursors": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "ObserverReadCursor"
          }
        },
        "projectionRevisions": {
          "type": "map",
          "required": true,
          "value": {
            "type": "number"
          },
          "key": {
            "type": "string"
          }
        }
      }
    },
    "GameTime": {
      "kind": "interface",
      "fields": {
        "dayOrdinal": {
          "type": "number",
          "required": true
        },
        "minuteOfDay": {
          "type": "number",
          "required": true
        }
      }
    },
    "GameClock": {
      "kind": "interface",
      "fields": {
        "now": {
          "type": "ref",
          "required": true,
          "to": "GameTime"
        },
        "defaultAdvanceMinutes": {
          "type": "number",
          "required": true
        },
        "policyVersion": {
          "type": "number",
          "required": true
        },
        "lastAdvanceRevision": {
          "type": "number",
          "required": true
        },
        "lastAdvanceCommandId": {
          "type": "string",
          "required": false
        }
      }
    },
    "StoryFocus": {
      "kind": "interface",
      "fields": {
        "focusId": {
          "type": "string",
          "required": true
        },
        "trackId": {
          "type": "string",
          "required": false
        },
        "unitId": {
          "type": "string",
          "required": false
        },
        "status": {
          "type": "enum",
          "required": true,
          "enum": "StoryFocusStatus"
        },
        "reasonCodes": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "enteredAtRevision": {
          "type": "number",
          "required": true
        }
      }
    },
    "WorldEntityState": {
      "kind": "interface",
      "fields": {
        "entityId": {
          "type": "string",
          "required": true
        },
        "entityType": {
          "type": "enum",
          "required": true,
          "enum": "WorldEntityType"
        },
        "status": {
          "type": "enum",
          "required": true,
          "enum": "WorldEntityStatus"
        },
        "locationId": {
          "type": "string",
          "required": false
        },
        "anchorId": {
          "type": "string",
          "required": false
        },
        "attributes": {
          "type": "open_map",
          "required": true,
          "valueTypes": [
            "string",
            "number",
            "boolean",
            "null"
          ],
          "canonicalOpen": true
        },
        "stateRevision": {
          "type": "number",
          "required": true
        }
      }
    },
    "WorldEventDefinition": {
      "kind": "interface",
      "fields": {
        "eventDefinitionId": {
          "type": "string",
          "required": true
        },
        "origin": {
          "type": "enum",
          "required": true,
          "enum": "WorldEventDefinitionOrigin"
        },
        "title": {
          "type": "string",
          "required": true
        },
        "trackId": {
          "type": "string",
          "required": false
        },
        "actorEntityIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "targetEntityIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "dependencyDefinitionIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "completionPredicate": {
          "type": "ref",
          "required": true,
          "to": "CompletionPredicate"
        },
        "scheduling": {
          "type": "ref",
          "required": true,
          "to": "WorldEventDefinitionScheduling"
        },
        "allowedResolutionModes": {
          "type": "array",
          "required": true,
          "items": {
            "type": "enum",
            "enum": "EventDefinitionResolutionMode"
          }
        },
        "replayPolicy": {
          "type": "enum",
          "required": true,
          "enum": "WorldEventReplayPolicy"
        },
        "publicScope": {
          "type": "ref",
          "required": true,
          "to": "PublicScope"
        },
        "consequenceDefinitionIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "definitionFingerprint": {
          "type": "string",
          "required": true
        }
      }
    },
    "WorldEventDefinitionScheduling": {
      "kind": "interface",
      "fields": {
        "earliestAt": {
          "type": "ref",
          "required": false,
          "to": "GameTime"
        },
        "dueAt": {
          "type": "ref",
          "required": false,
          "to": "GameTime"
        },
        "missAfter": {
          "type": "ref",
          "required": false,
          "to": "GameTime"
        }
      }
    },
    "WorldEventInstance": {
      "kind": "interface",
      "fields": {
        "eventInstanceId": {
          "type": "string",
          "required": true
        },
        "eventDefinitionId": {
          "type": "string",
          "required": true
        },
        "parentInstanceId": {
          "type": "string",
          "required": false
        },
        "status": {
          "type": "enum",
          "required": true,
          "enum": "WorldEventInstanceStatus"
        },
        "startAt": {
          "type": "ref",
          "required": false,
          "to": "GameTime"
        },
        "dueAt": {
          "type": "ref",
          "required": false,
          "to": "GameTime"
        },
        "resolvedAt": {
          "type": "ref",
          "required": false,
          "to": "GameTime"
        },
        "resolutionMode": {
          "type": "enum",
          "required": false,
          "enum": "WorldEventResolutionMode"
        },
        "outcome": {
          "type": "enum",
          "required": false,
          "enum": "WorldEventOutcome"
        },
        "replayPolicy": {
          "type": "enum",
          "required": true,
          "enum": "WorldEventReplayPolicy"
        },
        "participantIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "dependencyIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "publicFactIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "terminalFactId": {
          "type": "string",
          "required": false
        },
        "idempotencyKey": {
          "type": "string",
          "required": true
        },
        "eventResolutionKey": {
          "type": "string",
          "required": false
        },
        "source": {
          "type": "ref",
          "required": true,
          "to": "EvidenceRef"
        }
      }
    },
    "EmergentEventDefinition": {
      "kind": "interface",
      "fields": {
        "eventDefinitionId": {
          "type": "string",
          "required": true
        },
        "origin": {
          "type": "literal",
          "required": true,
          "value": "emergent"
        },
        "runtimeBranchId": {
          "type": "string",
          "required": true
        },
        "causeEvidenceRefs": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "EvidenceRef"
          }
        },
        "identityAnchors": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "completionPredicate": {
          "type": "ref",
          "required": true,
          "to": "CompletionPredicate"
        },
        "replayPolicy": {
          "type": "enum",
          "required": true,
          "enum": "WorldEventReplayPolicy"
        },
        "publicScope": {
          "type": "ref",
          "required": true,
          "to": "PublicScope"
        },
        "definitionFingerprint": {
          "type": "string",
          "required": true
        }
      }
    },
    "CompletionPredicate": {
      "kind": "interface",
      "fields": {
        "predicateId": {
          "type": "string",
          "required": true
        },
        "targetEntityIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "targetEventInstanceId": {
          "type": "string",
          "required": false
        },
        "requiredFactTypes": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "requiredEvidenceKinds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "enum",
            "enum": "EvidenceRefKind"
          }
        },
        "payloadMatchers": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "PayloadMatcher"
          }
        },
        "minimumEvidenceCount": {
          "type": "number",
          "required": true
        },
        "deterministicKey": {
          "type": "string",
          "required": true
        },
        "allowedOutcomes": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "failureOutcomes": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        }
      }
    },
    "PayloadMatcher": {
      "kind": "interface",
      "fields": {
        "path": {
          "type": "string",
          "required": true
        },
        "operator": {
          "type": "enum",
          "required": true,
          "enum": "PayloadMatcherOperator"
        },
        "value": {
          "type": "scalar_union",
          "required": true,
          "elementTypes": [
            "string",
            "number",
            "boolean",
            "string_array"
          ]
        }
      }
    },
    "CommittedWorldFact": {
      "kind": "interface",
      "fields": {
        "factId": {
          "type": "string",
          "required": true
        },
        "eventInstanceId": {
          "type": "string",
          "required": true
        },
        "sourceRevision": {
          "type": "number",
          "required": true
        },
        "factType": {
          "type": "string",
          "required": true
        },
        "payload": {
          "type": "open_map",
          "required": true,
          "valueTypes": [
            "unknown"
          ],
          "canonicalOpen": true
        },
        "occurredAt": {
          "type": "ref",
          "required": true,
          "to": "GameTime"
        },
        "committedAt": {
          "type": "ref",
          "required": true,
          "to": "GameTime"
        },
        "publicScope": {
          "type": "ref",
          "required": true,
          "to": "PublicScope"
        },
        "evidenceRefs": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "EvidenceRef"
          }
        },
        "evidenceLevel": {
          "type": "enum",
          "required": true,
          "enum": "EvidenceLevel"
        },
        "supersedesFactId": {
          "type": "string",
          "required": false
        },
        "invalidatesEventInstanceIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "playerParticipated": {
          "type": "boolean",
          "required": true
        },
        "playerObserverVisible": {
          "type": "boolean",
          "required": true
        },
        "createdBy": {
          "type": "enum",
          "required": true,
          "enum": "FactCreatedBy"
        }
      }
    },
    "EvidenceRef": {
      "kind": "union",
      "discriminator": "kind",
      "variants": [
        {
          "tag": "narrative_span",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "narrative_span"
            },
            "responseId": {
              "type": "string",
              "required": true
            },
            "messageId": {
              "type": "string",
              "required": false
            },
            "bodyFingerprint": {
              "type": "string",
              "required": true
            },
            "normalizationVersion": {
              "type": "number",
              "required": true
            },
            "startOffset": {
              "type": "number",
              "required": true
            },
            "endOffset": {
              "type": "number",
              "required": true
            },
            "textFingerprint": {
              "type": "string",
              "required": true
            }
          }
        },
        {
          "tag": "system_command",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "system_command"
            },
            "commandId": {
              "type": "string",
              "required": true
            },
            "commandFingerprint": {
              "type": "string",
              "required": true
            }
          }
        },
        {
          "tag": "gameplay_receipt",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "gameplay_receipt"
            },
            "receiptId": {
              "type": "string",
              "required": true
            },
            "receiptType": {
              "type": "string",
              "required": true
            }
          }
        },
        {
          "tag": "schedule_record",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "schedule_record"
            },
            "scheduleId": {
              "type": "string",
              "required": true
            },
            "scheduleRevision": {
              "type": "number",
              "required": true
            }
          }
        },
        {
          "tag": "notice_record",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "notice_record"
            },
            "noticeId": {
              "type": "string",
              "required": true
            },
            "noticeRevision": {
              "type": "number",
              "required": true
            }
          }
        },
        {
          "tag": "broadcast_record",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "broadcast_record"
            },
            "broadcastId": {
              "type": "string",
              "required": true
            },
            "deliveryId": {
              "type": "string",
              "required": false
            },
            "sourceRevision": {
              "type": "number",
              "required": true
            },
            "recipientSnapshotFingerprint": {
              "type": "string",
              "required": true
            }
          }
        },
        {
          "tag": "article_version",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "article_version"
            },
            "articleId": {
              "type": "string",
              "required": true
            },
            "articleVersion": {
              "type": "number",
              "required": true
            },
            "claimFingerprint": {
              "type": "string",
              "required": true
            }
          }
        },
        {
          "tag": "migration_record",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "migration_record"
            },
            "migrationId": {
              "type": "string",
              "required": true
            },
            "sourcePath": {
              "type": "string",
              "required": true
            },
            "sourceFingerprint": {
              "type": "string",
              "required": true
            }
          }
        },
        {
          "tag": "projection_record",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "projection_record"
            },
            "projectionKind": {
              "type": "string",
              "required": true
            },
            "projectionId": {
              "type": "string",
              "required": true
            },
            "projectionRevision": {
              "type": "number",
              "required": true
            }
          }
        },
        {
          "tag": "narrative_publication",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "narrative_publication"
            },
            "publicationId": {
              "type": "string",
              "required": true
            },
            "bodyFingerprint": {
              "type": "string",
              "required": true
            },
            "commitReceiptId": {
              "type": "string",
              "required": true
            }
          }
        }
      ]
    },
    "PublicScope": {
      "kind": "union",
      "discriminator": "kind",
      "variants": [
        {
          "tag": "private",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "private"
            }
          }
        },
        {
          "tag": "local",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "local"
            },
            "locationIds": {
              "type": "array",
              "required": true,
              "items": {
                "type": "string"
              }
            },
            "anchorIds": {
              "type": "array",
              "required": false,
              "items": {
                "type": "string"
              }
            }
          }
        },
        {
          "tag": "faction",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "faction"
            },
            "factionIds": {
              "type": "array",
              "required": true,
              "items": {
                "type": "string"
              }
            }
          }
        },
        {
          "tag": "public",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "public"
            },
            "regionIds": {
              "type": "array",
              "required": false,
              "items": {
                "type": "string"
              }
            }
          }
        },
        {
          "tag": "broadcast",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "broadcast"
            },
            "networkIds": {
              "type": "array",
              "required": true,
              "items": {
                "type": "string"
              }
            },
            "recipientIds": {
              "type": "array",
              "required": false,
              "items": {
                "type": "string"
              }
            }
          }
        }
      ]
    },
    "ArticlePolicy": {
      "kind": "interface",
      "fields": {
        "regionIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "audienceKinds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "enum",
            "enum": "ArticleAudienceKind"
          }
        },
        "category": {
          "type": "string",
          "required": true
        },
        "aggregationKey": {
          "type": "string",
          "required": true
        },
        "maxSourceRefs": {
          "type": "number",
          "required": true
        }
      }
    },
    "OpeningPrelude": {
      "kind": "interface",
      "fields": {
        "preludeId": {
          "type": "string",
          "required": true
        },
        "runtimeBranchId": {
          "type": "string",
          "required": true
        },
        "bodyFingerprint": {
          "type": "string",
          "required": true
        },
        "sourceRefs": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "OpeningPreludeSourceRef"
          }
        },
        "nonProgressing": {
          "type": "boolean",
          "required": true
        },
        "idempotencyKey": {
          "type": "string",
          "required": true
        }
      }
    },
    "OpeningPreludeSourceRef": {
      "kind": "union",
      "discriminator": "kind",
      "variants": [
        {
          "tag": "official_notice",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "official_notice"
            },
            "noticeId": {
              "type": "string",
              "required": true
            },
            "noticeRevision": {
              "type": "number",
              "required": true
            }
          }
        },
        {
          "tag": "public_schedule",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "public_schedule"
            },
            "scheduleId": {
              "type": "string",
              "required": true
            },
            "scheduleRevision": {
              "type": "number",
              "required": true
            }
          }
        },
        {
          "tag": "manual",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "manual"
            },
            "draftId": {
              "type": "string",
              "required": true
            },
            "nonProgressing": {
              "type": "literal",
              "required": true,
              "value": true
            }
          }
        }
      ]
    },
    "PlayerPlanItem": {
      "kind": "interface",
      "fields": {
        "planItemId": {
          "type": "string",
          "required": true
        },
        "unitId": {
          "type": "string",
          "required": false
        },
        "status": {
          "type": "enum",
          "required": true,
          "enum": "PlayerPlanItemStatus"
        },
        "dependencyFactIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "acceptanceModes": {
          "type": "array",
          "required": true,
          "items": {
            "type": "enum",
            "enum": "AcceptanceMode"
          }
        },
        "expiresAt": {
          "type": "ref",
          "required": false,
          "to": "GameTime"
        },
        "evidenceRefs": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "EvidenceRef"
          }
        }
      }
    },
    "WorldPlanItem": {
      "kind": "interface",
      "fields": {
        "planItemId": {
          "type": "string",
          "required": true
        },
        "eventDefinitionId": {
          "type": "string",
          "required": true
        },
        "status": {
          "type": "enum",
          "required": true,
          "enum": "WorldPlanItemStatus"
        },
        "dueAt": {
          "type": "ref",
          "required": false,
          "to": "GameTime"
        },
        "dependencyIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "publicScheduleId": {
          "type": "string",
          "required": false
        },
        "consequenceDefinitionIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "evidenceRefs": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "EvidenceRef"
          }
        }
      }
    },
    "ConvergenceItem": {
      "kind": "interface",
      "fields": {
        "convergenceId": {
          "type": "string",
          "required": true
        },
        "sourceFactIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "status": {
          "type": "enum",
          "required": true,
          "enum": "ConvergenceItemStatus"
        },
        "eligiblePlanItemIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "playerDecisionRequired": {
          "type": "boolean",
          "required": true
        },
        "expiresAt": {
          "type": "ref",
          "required": false,
          "to": "GameTime"
        },
        "evidenceRefs": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "EvidenceRef"
          }
        }
      }
    },
    "RuntimeMigrationMeta": {
      "kind": "interface",
      "fields": {
        "status": {
          "type": "enum",
          "required": true,
          "enum": "RuntimeMigrationStatus"
        },
        "sourceSaveFingerprint": {
          "type": "string",
          "required": false
        },
        "migrationId": {
          "type": "string",
          "required": false
        },
        "legacyIdMapFingerprint": {
          "type": "string",
          "required": false
        },
        "unresolvedCursorIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "warnings": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "confirmedAtRevision": {
          "type": "number",
          "required": false
        }
      }
    },
    "OfficialNotice": {
      "kind": "interface",
      "fields": {
        "noticeId": {
          "type": "string",
          "required": true
        },
        "noticeRevision": {
          "type": "number",
          "required": true
        },
        "issuerId": {
          "type": "string",
          "required": true
        },
        "claimFingerprint": {
          "type": "string",
          "required": true
        },
        "status": {
          "type": "enum",
          "required": true,
          "enum": "OfficialNoticeStatus"
        },
        "publicScope": {
          "type": "ref",
          "required": true,
          "to": "PublicScope"
        },
        "source": {
          "type": "ref",
          "required": true,
          "to": "EvidenceRef"
        },
        "issuedAt": {
          "type": "ref",
          "required": true,
          "to": "GameTime"
        },
        "supersedesNoticeId": {
          "type": "string",
          "required": false
        }
      }
    },
    "KnowledgeGrant": {
      "kind": "interface",
      "fields": {
        "runtimeBranchId": {
          "type": "string",
          "required": true
        },
        "grantId": {
          "type": "string",
          "required": true
        },
        "subjectType": {
          "type": "enum",
          "required": true,
          "enum": "KnowledgeSubjectType"
        },
        "subjectId": {
          "type": "string",
          "required": true
        },
        "subjectRef": {
          "type": "ref",
          "required": true,
          "to": "KnowledgeSubjectRef"
        },
        "effectiveFromRuntimeRevision": {
          "type": "number",
          "required": true
        },
        "audienceSnapshot": {
          "type": "ref",
          "required": false,
          "to": "AudienceSnapshot"
        },
        "evidenceRefs": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "EvidenceRef"
          }
        },
        "idempotencyKey": {
          "type": "string",
          "required": true
        }
      }
    },
    "TurnAdjudicationReceipt": {
      "kind": "interface",
      "fields": {
        "receiptId": {
          "type": "string",
          "required": true
        },
        "runtimeBranchId": {
          "type": "string",
          "required": true
        },
        "inputRuntimeRevision": {
          "type": "number",
          "required": true
        },
        "outputRuntimeRevision": {
          "type": "number",
          "required": false
        },
        "narrativeDecision": {
          "type": "ref",
          "required": false,
          "to": "NarrativeConsistencyDecision"
        },
        "acceptedCandidateIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "rejectedCandidateIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "completedUnitIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "blockedReasons": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "sourceFactIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "outboxIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "errorCodes": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "durationMs": {
          "type": "number",
          "required": true
        }
      }
    },
    "TurnAttemptReceipt": {
      "kind": "interface",
      "fields": {
        "attemptId": {
          "type": "string",
          "required": true
        },
        "turnId": {
          "type": "string",
          "required": true
        },
        "runtimeBranchId": {
          "type": "string",
          "required": true
        },
        "expectedRuntimeRevision": {
          "type": "number",
          "required": true
        },
        "committedRuntimeRevision": {
          "type": "number",
          "required": false
        },
        "preTurnCheckpointId": {
          "type": "string",
          "required": true
        },
        "commitReceiptId": {
          "type": "string",
          "required": false
        },
        "phase": {
          "type": "enum",
          "required": true,
          "enum": "TurnAttemptPhase"
        },
        "failureCode": {
          "type": "string",
          "required": false
        },
        "recoveryAction": {
          "type": "enum",
          "required": false,
          "enum": "TurnRecoveryAction"
        },
        "createdAt": {
          "type": "number",
          "required": true
        },
        "updatedAt": {
          "type": "number",
          "required": true
        }
      }
    },
    "EventTargetRef": {
      "kind": "interface",
      "fields": {
        "eventInstanceId": {
          "type": "string",
          "required": true
        },
        "expectedInstanceFingerprint": {
          "type": "string",
          "required": true
        }
      }
    },
    "CreateEventProposal": {
      "kind": "interface",
      "fields": {
        "definitionRef": {
          "type": "object",
          "required": true,
          "fields": {
            "eventDefinitionId": {
              "type": "string",
              "required": true
            },
            "definitionFingerprint": {
              "type": "string",
              "required": true
            }
          }
        },
        "parentTarget": {
          "type": "ref",
          "required": false,
          "to": "EventTargetRef"
        },
        "evidenceRefs": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "EvidenceRef"
          }
        }
      }
    },
    "FactProposal": {
      "kind": "interface",
      "fields": {
        "eventTarget": {
          "type": "ref",
          "required": true,
          "to": "EventTargetRef"
        },
        "factType": {
          "type": "string",
          "required": true
        },
        "payload": {
          "type": "open_map",
          "required": true,
          "valueTypes": [
            "unknown"
          ],
          "canonicalOpen": true
        },
        "publicScope": {
          "type": "ref",
          "required": true,
          "to": "PublicScope"
        },
        "evidenceRefs": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "EvidenceRef"
          }
        },
        "evidenceLevel": {
          "type": "enum",
          "required": true,
          "enum": "EvidenceLevel"
        },
        "playerParticipated": {
          "type": "boolean",
          "required": true
        }
      }
    },
    "KnowledgeGrantProposal": {
      "kind": "interface",
      "fields": {
        "subjectType": {
          "type": "enum",
          "required": true,
          "enum": "KnowledgeSubjectType"
        },
        "subjectId": {
          "type": "string",
          "required": true
        },
        "subjectRef": {
          "type": "ref",
          "required": true,
          "to": "KnowledgeSubjectRef"
        },
        "audienceSelector": {
          "type": "ref",
          "required": false,
          "to": "AudienceSelector"
        },
        "evidenceRefs": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "EvidenceRef"
          }
        }
      }
    },
    "PublicScheduleProposal": {
      "kind": "interface",
      "fields": {
        "sourceDefinitionId": {
          "type": "string",
          "required": true
        },
        "plannedAt": {
          "type": "ref",
          "required": true,
          "to": "GameTime"
        },
        "publicScope": {
          "type": "ref",
          "required": true,
          "to": "PublicScope"
        },
        "source": {
          "type": "ref",
          "required": true,
          "to": "EvidenceRef"
        }
      }
    },
    "OfficialNoticeProposal": {
      "kind": "interface",
      "fields": {
        "issuerId": {
          "type": "string",
          "required": true
        },
        "claimFingerprint": {
          "type": "string",
          "required": true
        },
        "publicScope": {
          "type": "ref",
          "required": true,
          "to": "PublicScope"
        },
        "source": {
          "type": "ref",
          "required": true,
          "to": "EvidenceRef"
        }
      }
    },
    "EmergentEventDefinitionProposal": {
      "kind": "interface",
      "fields": {
        "title": {
          "type": "string",
          "required": true
        },
        "actorEntityIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "targetEntityIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "dependencyDefinitionIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "completionPredicate": {
          "type": "ref",
          "required": true,
          "to": "CompletionPredicate"
        },
        "replayPolicy": {
          "type": "enum",
          "required": true,
          "enum": "WorldEventReplayPolicy"
        },
        "publicScope": {
          "type": "ref",
          "required": true,
          "to": "PublicScope"
        },
        "causeEvidenceRefs": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "EvidenceRef"
          }
        },
        "identityAnchors": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        }
      }
    },
    "PlanItemProposal": {
      "kind": "interface",
      "fields": {
        "unitId": {
          "type": "string",
          "required": false
        },
        "eventDefinitionId": {
          "type": "string",
          "required": false
        },
        "dependencyFactIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "acceptanceModes": {
          "type": "array",
          "required": false,
          "items": {
            "type": "enum",
            "enum": "AcceptanceMode"
          }
        },
        "bridgeOptions": {
          "type": "array",
          "required": false,
          "items": {
            "type": "string"
          }
        },
        "evidenceRefs": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "EvidenceRef"
          }
        }
      }
    },
    "ConvergenceProposal": {
      "kind": "interface",
      "fields": {
        "sourceFactIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "eligiblePlanItemIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "bridgeOptions": {
          "type": "array",
          "required": false,
          "items": {
            "type": "string"
          }
        },
        "evidenceRefs": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "EvidenceRef"
          }
        }
      }
    },
    "RuntimeCommand": {
      "kind": "union",
      "discriminator": "kind",
      "variants": [
        {
          "tag": "advance_time",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "advance_time"
            },
            "deltaMinutes": {
              "type": "number",
              "required": true
            },
            "reason": {
              "type": "enum",
              "required": true,
              "enum": "AdvanceTimeReason"
            }
          }
        },
        {
          "tag": "create_event_instance",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "create_event_instance"
            },
            "proposal": {
              "type": "ref",
              "required": true,
              "to": "CreateEventProposal"
            }
          }
        },
        {
          "tag": "resolve_event_instance",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "resolve_event_instance"
            },
            "target": {
              "type": "ref",
              "required": true,
              "to": "EventTargetRef"
            },
            "resolutionMode": {
              "type": "enum",
              "required": true,
              "enum": "WorldEventResolutionMode"
            },
            "outcome": {
              "type": "enum",
              "required": true,
              "enum": "WorldEventOutcome"
            },
            "evidenceRefs": {
              "type": "array",
              "required": true,
              "items": {
                "type": "ref",
                "to": "EvidenceRef"
              }
            }
          }
        },
        {
          "tag": "supersede_event_instance",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "supersede_event_instance"
            },
            "target": {
              "type": "ref",
              "required": true,
              "to": "EventTargetRef"
            },
            "replacementTarget": {
              "type": "ref",
              "required": false,
              "to": "EventTargetRef"
            },
            "reason": {
              "type": "string",
              "required": true
            },
            "evidenceRefs": {
              "type": "array",
              "required": true,
              "items": {
                "type": "ref",
                "to": "EvidenceRef"
              }
            }
          }
        },
        {
          "tag": "append_fact",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "append_fact"
            },
            "proposal": {
              "type": "ref",
              "required": true,
              "to": "FactProposal"
            }
          }
        },
        {
          "tag": "upsert_plan_item",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "upsert_plan_item"
            },
            "proposal": {
              "type": "ref",
              "required": true,
              "to": "PlanItemProposal"
            }
          }
        },
        {
          "tag": "enqueue_convergence",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "enqueue_convergence"
            },
            "proposal": {
              "type": "ref",
              "required": true,
              "to": "ConvergenceProposal"
            }
          }
        },
        {
          "tag": "register_emergent_event_definition",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "register_emergent_event_definition"
            },
            "proposal": {
              "type": "ref",
              "required": true,
              "to": "EmergentEventDefinitionProposal"
            }
          }
        },
        {
          "tag": "grant_knowledge",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "grant_knowledge"
            },
            "proposal": {
              "type": "ref",
              "required": true,
              "to": "KnowledgeGrantProposal"
            }
          }
        },
        {
          "tag": "publish_public_schedule",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "publish_public_schedule"
            },
            "proposal": {
              "type": "ref",
              "required": true,
              "to": "PublicScheduleProposal"
            }
          }
        },
        {
          "tag": "issue_official_notice",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "issue_official_notice"
            },
            "proposal": {
              "type": "ref",
              "required": true,
              "to": "OfficialNoticeProposal"
            }
          }
        },
        {
          "tag": "path_command",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "path_command"
            },
            "action": {
              "type": "enum",
              "required": true,
              "enum": "PathCommandAction"
            },
            "targetId": {
              "type": "string",
              "required": true
            },
            "payload": {
              "type": "open_map",
              "required": false,
              "valueTypes": [
                "unknown"
              ],
              "canonicalOpen": true
            }
          }
        }
      ]
    },
    "NewsSourceRef": {
      "kind": "union",
      "discriminator": "kind",
      "variants": [
        {
          "tag": "committed_fact",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "committed_fact"
            },
            "factId": {
              "type": "string",
              "required": true
            },
            "sourceRevision": {
              "type": "number",
              "required": true
            }
          }
        },
        {
          "tag": "public_schedule",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "public_schedule"
            },
            "scheduleId": {
              "type": "string",
              "required": true
            },
            "scheduleRevision": {
              "type": "number",
              "required": true
            }
          }
        },
        {
          "tag": "official_notice",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "official_notice"
            },
            "noticeId": {
              "type": "string",
              "required": true
            },
            "noticeRevision": {
              "type": "number",
              "required": true
            }
          }
        },
        {
          "tag": "article_version",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "article_version"
            },
            "articleId": {
              "type": "string",
              "required": true
            },
            "articleVersion": {
              "type": "number",
              "required": true
            },
            "claimFingerprint": {
              "type": "string",
              "required": true
            }
          }
        },
        {
          "tag": "manual",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "manual"
            },
            "draftId": {
              "type": "string",
              "required": true
            },
            "nonProgressing": {
              "type": "literal",
              "required": true,
              "value": true
            }
          }
        }
      ]
    },
    "PublicSchedule": {
      "kind": "interface",
      "fields": {
        "scheduleId": {
          "type": "string",
          "required": true
        },
        "sourceDefinitionId": {
          "type": "string",
          "required": true
        },
        "status": {
          "type": "enum",
          "required": true,
          "enum": "PublicScheduleStatus"
        },
        "plannedAt": {
          "type": "ref",
          "required": true,
          "to": "GameTime"
        },
        "publicScope": {
          "type": "ref",
          "required": true,
          "to": "PublicScope"
        },
        "source": {
          "type": "ref",
          "required": true,
          "to": "EvidenceRef"
        },
        "scheduleRevision": {
          "type": "number",
          "required": true
        },
        "idempotencyKey": {
          "type": "string",
          "required": true
        }
      }
    },
    "NewsArticleAggregate": {
      "kind": "interface",
      "fields": {
        "runtimeBranchId": {
          "type": "string",
          "required": true
        },
        "articleId": {
          "type": "string",
          "required": true
        },
        "currentVersion": {
          "type": "number",
          "required": true
        },
        "versionIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "aggregateRevision": {
          "type": "number",
          "required": true
        }
      }
    },
    "NewsArticleVersion": {
      "kind": "interface",
      "fields": {
        "runtimeBranchId": {
          "type": "string",
          "required": true
        },
        "articleVersionId": {
          "type": "string",
          "required": true
        },
        "articleId": {
          "type": "string",
          "required": true
        },
        "articleVersion": {
          "type": "number",
          "required": true
        },
        "sourceRefs": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "NewsSourceRef"
          }
        },
        "sourceFingerprint": {
          "type": "string",
          "required": true
        },
        "lifecycle": {
          "type": "enum",
          "required": true,
          "enum": "NewsArticleVersionLifecycle"
        },
        "storyPhase": {
          "type": "enum",
          "required": true,
          "enum": "NewsStoryPhase"
        },
        "category": {
          "type": "string",
          "required": true
        },
        "title": {
          "type": "string",
          "required": true
        },
        "body": {
          "type": "string",
          "required": true
        },
        "publishedAt": {
          "type": "ref",
          "required": false,
          "to": "GameTime"
        },
        "publicScope": {
          "type": "ref",
          "required": true,
          "to": "PublicScope"
        },
        "reliability": {
          "type": "enum",
          "required": true,
          "enum": "NewsReliability"
        },
        "isCorrection": {
          "type": "boolean",
          "required": true
        },
        "correctsArticleId": {
          "type": "string",
          "required": false
        },
        "sourceTrace": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "EvidenceRef"
          }
        },
        "migrationTrace": {
          "type": "object",
          "required": false,
          "fields": {
            "status": {
              "type": "enum",
              "required": true,
              "enum": "MigrationTraceStatus"
            },
            "rawFieldPaths": {
              "type": "array",
              "required": true,
              "items": {
                "type": "string"
              }
            },
            "rawPayloadFingerprint": {
              "type": "string",
              "required": true
            }
          }
        }
      }
    },
    "KnowledgeSubjectRef": {
      "kind": "union",
      "discriminator": "kind",
      "variants": [
        {
          "tag": "committed_fact",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "committed_fact"
            },
            "factId": {
              "type": "string",
              "required": true
            },
            "sourceRevision": {
              "type": "number",
              "required": true
            }
          }
        },
        {
          "tag": "public_schedule",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "public_schedule"
            },
            "scheduleId": {
              "type": "string",
              "required": true
            },
            "scheduleRevision": {
              "type": "number",
              "required": true
            }
          }
        },
        {
          "tag": "official_notice",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "official_notice"
            },
            "noticeId": {
              "type": "string",
              "required": true
            },
            "noticeRevision": {
              "type": "number",
              "required": true
            }
          }
        },
        {
          "tag": "article_version",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "article_version"
            },
            "articleId": {
              "type": "string",
              "required": true
            },
            "articleVersion": {
              "type": "number",
              "required": true
            },
            "claimFingerprint": {
              "type": "string",
              "required": true
            }
          }
        }
      ]
    },
    "AudienceSelector": {
      "kind": "interface",
      "fields": {
        "locationIds": {
          "type": "array",
          "required": false,
          "items": {
            "type": "string"
          }
        },
        "anchorIds": {
          "type": "array",
          "required": false,
          "items": {
            "type": "string"
          }
        },
        "factionIds": {
          "type": "array",
          "required": false,
          "items": {
            "type": "string"
          }
        },
        "networkIds": {
          "type": "array",
          "required": false,
          "items": {
            "type": "string"
          }
        },
        "explicitRecipientIds": {
          "type": "array",
          "required": false,
          "items": {
            "type": "string"
          }
        }
      }
    },
    "AudienceSnapshot": {
      "kind": "interface",
      "fields": {
        "selector": {
          "type": "ref",
          "required": true,
          "to": "AudienceSelector"
        },
        "recipientIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "locationEvidence": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "EvidenceRef"
          }
        },
        "frozenAtRevision": {
          "type": "number",
          "required": true
        }
      }
    },
    "BroadcastEnvelope": {
      "kind": "interface",
      "fields": {
        "broadcastId": {
          "type": "string",
          "required": true
        },
        "runtimeBranchId": {
          "type": "string",
          "required": true
        },
        "sourceRef": {
          "type": "ref",
          "required": true,
          "to": "KnowledgeSubjectRef"
        },
        "channel": {
          "type": "enum",
          "required": true,
          "enum": "BroadcastChannel"
        },
        "issuedAt": {
          "type": "ref",
          "required": true,
          "to": "GameTime"
        },
        "audienceSnapshot": {
          "type": "ref",
          "required": true,
          "to": "AudienceSnapshot"
        },
        "deliveryIdempotencyKey": {
          "type": "string",
          "required": true
        }
      }
    },
    "DeliveryRecord": {
      "kind": "interface",
      "fields": {
        "deliveryId": {
          "type": "string",
          "required": true
        },
        "broadcastId": {
          "type": "string",
          "required": true
        },
        "runtimeBranchId": {
          "type": "string",
          "required": true
        },
        "recipientId": {
          "type": "string",
          "required": true
        },
        "deliveredAt": {
          "type": "ref",
          "required": true,
          "to": "GameTime"
        },
        "deliveryIdempotencyKey": {
          "type": "string",
          "required": true
        },
        "evidenceRef": {
          "type": "ref",
          "required": true,
          "to": "EvidenceRef"
        }
      }
    },
    "KnowledgeReceipt": {
      "kind": "interface",
      "fields": {
        "runtimeBranchId": {
          "type": "string",
          "required": true
        },
        "receiptId": {
          "type": "string",
          "required": true
        },
        "subjectType": {
          "type": "enum",
          "required": true,
          "enum": "KnowledgeSubjectType"
        },
        "subjectId": {
          "type": "string",
          "required": true
        },
        "subjectRef": {
          "type": "ref",
          "required": true,
          "to": "KnowledgeSubjectRef"
        },
        "knowledgeKind": {
          "type": "enum",
          "required": true,
          "enum": "KnowledgeKind"
        },
        "claimReliability": {
          "type": "enum",
          "required": true,
          "enum": "NewsReliability"
        },
        "truthBinding": {
          "type": "object",
          "required": false,
          "fields": {
            "factId": {
              "type": "string",
              "required": true
            },
            "sourceRevision": {
              "type": "number",
              "required": true
            }
          }
        },
        "channel": {
          "type": "enum",
          "required": true,
          "enum": "KnowledgeChannel"
        },
        "broadcastEnvelopeId": {
          "type": "string",
          "required": false
        },
        "audienceSnapshot": {
          "type": "ref",
          "required": false,
          "to": "AudienceSnapshot"
        },
        "observedAt": {
          "type": "ref",
          "required": true,
          "to": "GameTime"
        },
        "deliveryEvidenceRef": {
          "type": "ref",
          "required": true,
          "to": "EvidenceRef"
        },
        "confidence": {
          "type": "enum",
          "required": true,
          "enum": "EvidenceLevel"
        },
        "idempotencyKey": {
          "type": "string",
          "required": true
        }
      }
    },
    "ObserverReadCursor": {
      "kind": "interface",
      "fields": {
        "runtimeBranchId": {
          "type": "string",
          "required": true
        },
        "observerId": {
          "type": "string",
          "required": true
        },
        "channel": {
          "type": "enum",
          "required": true,
          "enum": "ObserverReadChannel"
        },
        "lastReadArticleVersionId": {
          "type": "string",
          "required": false
        },
        "lastReadAt": {
          "type": "ref",
          "required": false,
          "to": "GameTime"
        }
      }
    },
    "ProjectionOutboxItem": {
      "kind": "interface",
      "fields": {
        "outboxId": {
          "type": "string",
          "required": true
        },
        "schemaVersion": {
          "type": "number",
          "required": true
        },
        "runtimeBranchId": {
          "type": "string",
          "required": true
        },
        "sourceRefFingerprint": {
          "type": "string",
          "required": true
        },
        "sourceRevision": {
          "type": "number",
          "required": true
        },
        "kind": {
          "type": "enum",
          "required": true,
          "enum": "ProjectionOutboxKind"
        },
        "aggregateKey": {
          "type": "string",
          "required": true
        },
        "operation": {
          "type": "enum",
          "required": true,
          "enum": "ProjectionOutboxOperation"
        },
        "articlePolicyFingerprint": {
          "type": "string",
          "required": false
        },
        "sourceLevelIdempotencyKey": {
          "type": "string",
          "required": true
        },
        "eventResolutionKey": {
          "type": "string",
          "required": false
        },
        "deliveryKey": {
          "type": "string",
          "required": true
        },
        "payloadFingerprint": {
          "type": "string",
          "required": true
        },
        "expectedAggregateRevision": {
          "type": "number",
          "required": false
        },
        "articleVersionHint": {
          "type": "number",
          "required": false
        },
        "payloadRef": {
          "type": "object",
          "required": true,
          "fields": {
            "kind": {
              "type": "enum",
              "required": true,
              "enum": "PayloadRefKind"
            },
            "key": {
              "type": "string",
              "required": true
            }
          }
        },
        "consumerIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "consumerAcks": {
          "type": "map",
          "required": true,
          "value": {
            "type": "object",
            "fields": {
              "status": {
                "type": "enum",
                "enum": "OutboxConsumerStatus",
                "required": true
              },
              "attemptCount": {
                "type": "number",
                "required": true
              },
              "deliveredAt": {
                "type": "number",
                "required": false
              },
              "projectionRevision": {
                "type": "number",
                "required": false
              },
              "lastErrorCode": {
                "type": "string",
                "required": false
              }
            }
          },
          "key": {
            "type": "string"
          }
        },
        "createdAt": {
          "type": "number",
          "required": true
        },
        "retainUntil": {
          "type": "number",
          "required": false
        },
        "status": {
          "type": "enum",
          "required": true,
          "enum": "OutboxItemStatus"
        },
        "attemptCount": {
          "type": "number",
          "required": true
        },
        "leaseOwner": {
          "type": "string",
          "required": false
        },
        "leaseExpiresAt": {
          "type": "number",
          "required": false
        },
        "nextRetryAt": {
          "type": "number",
          "required": false
        },
        "deliveredAt": {
          "type": "number",
          "required": false
        },
        "lastErrorCode": {
          "type": "string",
          "required": false
        }
      }
    },
    "NarrativeRewriteRequest": {
      "kind": "interface",
      "fields": {
        "requestId": {
          "type": "string",
          "required": true
        },
        "sourceBodyFingerprint": {
          "type": "string",
          "required": true
        },
        "violationCodes": {
          "type": "array",
          "required": true,
          "items": {
            "type": "enum",
            "enum": "NarrativeConsistencyCode"
          }
        },
        "allowedOperation": {
          "type": "enum",
          "required": true,
          "enum": "NarrativeRewriteOperation"
        },
        "maxAttempts": {
          "type": "number",
          "required": true
        },
        "attempt": {
          "type": "number",
          "required": true
        }
      }
    },
    "NarrativeConsistencyDecision": {
      "kind": "interface",
      "fields": {
        "outcome": {
          "type": "enum",
          "required": true,
          "enum": "NarrativeDecisionOutcome"
        },
        "codes": {
          "type": "array",
          "required": true,
          "items": {
            "type": "enum",
            "enum": "NarrativeConsistencyCode"
          }
        },
        "evidenceRefs": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "EvidenceRef"
          }
        },
        "focusBefore": {
          "type": "string",
          "required": true
        },
        "focusAfterCandidate": {
          "type": "string",
          "required": false
        },
        "replayedEventInstanceIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "completedUnitIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "retryCount": {
          "type": "number",
          "required": true
        },
        "candidateBodyFingerprint": {
          "type": "string",
          "required": true
        },
        "acceptedBodyFingerprint": {
          "type": "string",
          "required": false
        },
        "acceptedBodyRef": {
          "type": "ref",
          "required": false,
          "to": "EvidenceRef"
        },
        "rewriteRequest": {
          "type": "ref",
          "required": false,
          "to": "NarrativeRewriteRequest"
        }
      }
    },
    "NarrativePublicationRecord": {
      "kind": "interface",
      "fields": {
        "publicationId": {
          "type": "string",
          "required": true
        },
        "runtimeBranchId": {
          "type": "string",
          "required": true
        },
        "turnId": {
          "type": "string",
          "required": true
        },
        "sourceRuntimeRevision": {
          "type": "number",
          "required": true
        },
        "commitReceiptId": {
          "type": "string",
          "required": true
        },
        "body": {
          "type": "string",
          "required": true
        },
        "bodyFingerprint": {
          "type": "string",
          "required": true
        },
        "status": {
          "type": "enum",
          "required": true,
          "enum": "NarrativePublicationStatus"
        },
        "revealMessageId": {
          "type": "string",
          "required": false
        },
        "revealAttemptCount": {
          "type": "number",
          "required": true
        },
        "createdAt": {
          "type": "ref",
          "required": true,
          "to": "GameTime"
        },
        "revealedAt": {
          "type": "ref",
          "required": false,
          "to": "GameTime"
        }
      }
    },
    "StoryAssetCatalog": {
      "kind": "interface",
      "fields": {
        "schemaVersion": {
          "type": "literal",
          "required": true,
          "value": 1
        },
        "catalogId": {
          "type": "string",
          "required": true
        },
        "catalogRevision": {
          "type": "number",
          "required": true
        },
        "catalogFingerprint": {
          "type": "string",
          "required": true
        },
        "normalizationVersion": {
          "type": "number",
          "required": true
        },
        "sourceKind": {
          "type": "enum",
          "required": true,
          "enum": "StoryAssetCatalogSourceKind"
        },
        "title": {
          "type": "string",
          "required": true
        },
        "sourceRefs": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "series": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "StoryAssetSeries"
          }
        },
        "chapters": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "StoryAssetChapter"
          }
        },
        "segments": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "StoryAssetSegment"
          }
        },
        "characterProfiles": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "StoryAssetCharacterProfile"
          }
        },
        "factionProfiles": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "StoryAssetFactionProfile"
          }
        },
        "locationProfiles": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "StoryAssetLocationProfile"
          }
        },
        "constraints": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "StoryAssetConstraint"
          }
        },
        "visibilityHints": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "StoryAssetVisibilityHint"
          }
        },
        "timelineEntries": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "StoryAssetTimelineEntry"
          }
        },
        "routePolicies": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "StoryAssetRoutePolicy"
          }
        },
        "occurrenceDefinitions": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "StoryAssetOccurrenceDefinition"
          }
        },
        "eventDefinitions": {
          "type": "array",
          "required": true,
          "items": {
            "type": "ref",
            "to": "WorldEventDefinition"
          }
        }
      }
    },
    "StoryAssetSeries": {
      "kind": "interface",
      "fields": {
        "seriesId": {
          "type": "string",
          "required": true
        },
        "title": {
          "type": "string",
          "required": true
        },
        "workTitle": {
          "type": "string",
          "required": true
        },
        "ordinal": {
          "type": "number",
          "required": true
        },
        "chapterIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "segmentIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "openingSegmentIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "defaultRoutePolicyId": {
          "type": "string",
          "required": false
        },
        "sourceRef": {
          "type": "string",
          "required": false
        },
        "seriesFingerprint": {
          "type": "string",
          "required": true
        }
      }
    },
    "StoryAssetChapter": {
      "kind": "interface",
      "fields": {
        "chapterId": {
          "type": "string",
          "required": true
        },
        "seriesId": {
          "type": "string",
          "required": true
        },
        "ordinal": {
          "type": "number",
          "required": true
        },
        "title": {
          "type": "string",
          "required": true
        },
        "summary": {
          "type": "string",
          "required": true
        },
        "sourceText": {
          "type": "string",
          "required": false
        },
        "sourceLocator": {
          "type": "string",
          "required": false
        },
        "contentFingerprint": {
          "type": "string",
          "required": true
        },
        "chapterFingerprint": {
          "type": "string",
          "required": true
        }
      }
    },
    "StoryAssetChapterRange": {
      "kind": "interface",
      "fields": {
        "startOrdinal": {
          "type": "number",
          "required": true
        },
        "endOrdinal": {
          "type": "number",
          "required": true
        },
        "chapterIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        }
      }
    },
    "StoryAssetSegment": {
      "kind": "interface",
      "fields": {
        "segmentId": {
          "type": "string",
          "required": true
        },
        "seriesId": {
          "type": "string",
          "required": true
        },
        "ordinal": {
          "type": "number",
          "required": true
        },
        "title": {
          "type": "string",
          "required": true
        },
        "chapterRange": {
          "type": "ref",
          "required": true,
          "to": "StoryAssetChapterRange"
        },
        "isOpeningCandidate": {
          "type": "boolean",
          "required": true
        },
        "summary": {
          "type": "string",
          "required": true
        },
        "sourceExcerpt": {
          "type": "string",
          "required": false
        },
        "hardConstraintIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "foreshadowConstraintIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "characterProfileIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "factionProfileIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "locationProfileIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "eventDefinitionIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "timelineEntryIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "routePolicyId": {
          "type": "string",
          "required": true
        },
        "dependencySegmentIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "consequenceSegmentIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "segmentFingerprint": {
          "type": "string",
          "required": true
        }
      }
    },
    "StoryAssetCharacterProfile": {
      "kind": "interface",
      "fields": {
        "characterProfileId": {
          "type": "string",
          "required": true
        },
        "name": {
          "type": "string",
          "required": true
        },
        "aliases": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "identitySummary": {
          "type": "string",
          "required": true
        },
        "factionProfileIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "initialStance": {
          "type": "string",
          "required": true
        },
        "relationshipNotes": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "stateNotes": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "firstAppearanceSegmentId": {
          "type": "string",
          "required": false
        },
        "importance": {
          "type": "enum",
          "required": true,
          "enum": "StoryAssetProfileImportance"
        },
        "profileFingerprint": {
          "type": "string",
          "required": true
        }
      }
    },
    "StoryAssetFactionProfile": {
      "kind": "interface",
      "fields": {
        "factionProfileId": {
          "type": "string",
          "required": true
        },
        "name": {
          "type": "string",
          "required": true
        },
        "aliases": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "typeSummary": {
          "type": "string",
          "required": true
        },
        "territoryLocationIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "representativeCharacterIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "goalSummary": {
          "type": "string",
          "required": true
        },
        "stateSummary": {
          "type": "string",
          "required": true
        },
        "relationshipNotes": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "firstAppearanceSegmentId": {
          "type": "string",
          "required": false
        },
        "profileFingerprint": {
          "type": "string",
          "required": true
        }
      }
    },
    "StoryAssetLocationProfile": {
      "kind": "interface",
      "fields": {
        "locationProfileId": {
          "type": "string",
          "required": true
        },
        "name": {
          "type": "string",
          "required": true
        },
        "aliases": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "level": {
          "type": "enum",
          "required": true,
          "enum": "StoryAssetLocationLevel"
        },
        "parentLocationId": {
          "type": "string",
          "required": false
        },
        "factionProfileIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "functionSummary": {
          "type": "string",
          "required": true
        },
        "facilityOccurrenceDefinitionIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "firstAppearanceSegmentId": {
          "type": "string",
          "required": false
        },
        "profileFingerprint": {
          "type": "string",
          "required": true
        }
      }
    },
    "StoryAssetConstraint": {
      "kind": "interface",
      "fields": {
        "constraintId": {
          "type": "string",
          "required": true
        },
        "kind": {
          "type": "enum",
          "required": true,
          "enum": "StoryAssetConstraintKind"
        },
        "segmentIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "statement": {
          "type": "string",
          "required": true
        },
        "visibilityHintId": {
          "type": "string",
          "required": false
        },
        "nonProgressing": {
          "type": "literal",
          "required": true,
          "value": true
        },
        "constraintFingerprint": {
          "type": "string",
          "required": true
        }
      }
    },
    "StoryAssetVisibilityHint": {
      "kind": "interface",
      "fields": {
        "visibilityHintId": {
          "type": "string",
          "required": true
        },
        "knownByEntityIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "unknownToEntityIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "observerOnly": {
          "type": "boolean",
          "required": true
        },
        "grantsKnowledge": {
          "type": "literal",
          "required": true,
          "value": false
        },
        "hintFingerprint": {
          "type": "string",
          "required": true
        }
      }
    },
    "StoryAssetTimelineEntry": {
      "kind": "interface",
      "fields": {
        "timelineEntryId": {
          "type": "string",
          "required": true
        },
        "segmentId": {
          "type": "string",
          "required": true
        },
        "sequence": {
          "type": "number",
          "required": true
        },
        "title": {
          "type": "string",
          "required": true
        },
        "description": {
          "type": "string",
          "required": true
        },
        "at": {
          "type": "ref",
          "required": false,
          "to": "GameTime"
        },
        "actorEntityIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "eventDefinitionIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "timelineFingerprint": {
          "type": "string",
          "required": true
        }
      }
    },
    "StoryAssetRoutePolicy": {
      "kind": "interface",
      "fields": {
        "routePolicyId": {
          "type": "string",
          "required": true
        },
        "participationPolicy": {
          "type": "enum",
          "required": true,
          "enum": "StoryAssetParticipationPolicy"
        },
        "bypassPolicy": {
          "type": "enum",
          "required": true,
          "enum": "StoryAssetBypassPolicy"
        },
        "deviationPolicy": {
          "type": "enum",
          "required": true,
          "enum": "StoryAssetDeviationPolicy"
        },
        "earlyCompletionPolicy": {
          "type": "enum",
          "required": true,
          "enum": "StoryAssetEarlyCompletionPolicy"
        },
        "alternativeSegmentIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "consequenceSegmentIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "expiresAfterSegmentIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "routeFingerprint": {
          "type": "string",
          "required": true
        }
      }
    },
    "StoryAssetOccurrenceDefinition": {
      "kind": "interface",
      "fields": {
        "occurrenceDefinitionId": {
          "type": "string",
          "required": true
        },
        "title": {
          "type": "string",
          "required": true
        },
        "subject": {
          "type": "ref",
          "required": true,
          "to": "StoryAssetOccurrenceSubjectRef"
        },
        "occurrencePolicy": {
          "type": "enum",
          "required": true,
          "enum": "StoryAssetOccurrencePolicy"
        },
        "newInstancePolicy": {
          "type": "enum",
          "required": true,
          "enum": "StoryAssetNewInstancePolicy"
        },
        "identityAnchors": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "aliases": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "eventDefinitionIds": {
          "type": "array",
          "required": true,
          "items": {
            "type": "string"
          }
        },
        "definitionFingerprint": {
          "type": "string",
          "required": true
        }
      }
    },
    "StoryAssetOccurrenceSubjectRef": {
      "kind": "union",
      "discriminator": "kind",
      "variants": [
        {
          "tag": "event",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "event"
            },
            "eventDefinitionId": {
              "type": "string",
              "required": true
            }
          }
        },
        {
          "tag": "character",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "character"
            },
            "characterProfileId": {
              "type": "string",
              "required": true
            }
          }
        },
        {
          "tag": "facility",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "facility"
            },
            "facilityId": {
              "type": "string",
              "required": true
            },
            "locationProfileId": {
              "type": "string",
              "required": true
            }
          }
        },
        {
          "tag": "item",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "item"
            },
            "itemId": {
              "type": "string",
              "required": true
            }
          }
        },
        {
          "tag": "task_result",
          "fields": {
            "kind": {
              "type": "literal",
              "required": true,
              "value": "task_result"
            },
            "taskResultId": {
              "type": "string",
              "required": true
            }
          }
        }
      ]
    }
  },
  "enums": {
    "WorldEventInstanceStatus": [
      "scheduled",
      "active",
      "blocked",
      "resolution_pending",
      "resolved",
      "cancelled",
      "superseded",
      "missed",
      "archived"
    ],
    "WorldEventResolutionMode": [
      "player",
      "world_background",
      "shared",
      "player_early",
      "unknown"
    ],
    "EventDefinitionResolutionMode": [
      "player",
      "world_background",
      "shared",
      "player_early"
    ],
    "WorldEventOutcome": [
      "normal",
      "deviated",
      "escaped",
      "failed",
      "unknown"
    ],
    "WorldEventReplayPolicy": [
      "once",
      "allow_new_instance",
      "repeatable"
    ],
    "WorldEventDefinitionOrigin": [
      "catalog",
      "emergent"
    ],
    "WorldEntityType": [
      "npc",
      "faction",
      "location",
      "faction_asset",
      "system"
    ],
    "WorldEntityStatus": [
      "active",
      "inactive",
      "destroyed",
      "unknown"
    ],
    "StoryFocusStatus": [
      "active",
      "blocked",
      "awaiting_player",
      "completed",
      "diverged"
    ],
    "EvidenceLevel": [
      "confirmed",
      "supported"
    ],
    "FactCreatedBy": [
      "player_turn",
      "world_due",
      "manual_import",
      "system_migration",
      "debug",
      "path_command",
      "system"
    ],
    "PublicScheduleStatus": [
      "planned",
      "postponed",
      "cancelled",
      "fulfilled"
    ],
    "NewsArticleVersionLifecycle": [
      "draft",
      "queued",
      "published",
      "corrected",
      "archived"
    ],
    "NewsStoryPhase": [
      "upcoming",
      "ongoing",
      "completed",
      "postponed",
      "cancelled"
    ],
    "NewsReliability": [
      "official",
      "confirmed",
      "supported",
      "rumor",
      "manual"
    ],
    "MigrationTraceStatus": [
      "known",
      "unknown",
      "ambiguous"
    ],
    "BroadcastChannel": [
      "station_broadcast",
      "phone_network",
      "faction_network",
      "direct_radio"
    ],
    "KnowledgeSubjectType": [
      "npc",
      "faction",
      "player_character"
    ],
    "KnowledgeKind": [
      "fact",
      "claim"
    ],
    "KnowledgeChannel": [
      "direct_observation",
      "broadcast",
      "communication",
      "dialogue",
      "reading",
      "narrative_delivery"
    ],
    "ObserverReadChannel": [
      "player_ui",
      "player_character",
      "npc",
      "faction"
    ],
    "ProjectionOutboxKind": [
      "news",
      "knowledge",
      "phone",
      "memory",
      "yiting",
      "zhiku",
      "map",
      "compat_world_events"
    ],
    "ProjectionOutboxOperation": [
      "create",
      "deliver",
      "rewrite",
      "correct",
      "archive"
    ],
    "OutboxConsumerStatus": [
      "pending",
      "delivered",
      "retry_wait",
      "dead_letter",
      "cancelled"
    ],
    "OutboxItemStatus": [
      "pending",
      "leased",
      "retry_wait",
      "delivered",
      "dead_letter",
      "cancelled"
    ],
    "PayloadRefKind": [
      "inline",
      "payload_store"
    ],
    "PlayerPlanItemStatus": [
      "available",
      "selected",
      "blocked",
      "expired",
      "completed",
      "replaced"
    ],
    "AcceptanceMode": [
      "正文承接",
      "系统命令",
      "交汇承接"
    ],
    "WorldPlanItemStatus": [
      "scheduled",
      "active",
      "blocked",
      "expired",
      "fulfilled",
      "cancelled"
    ],
    "ConvergenceItemStatus": [
      "available",
      "offered",
      "accepted",
      "declined",
      "expired",
      "resolved"
    ],
    "RuntimeMigrationStatus": [
      "none",
      "pending_confirmation",
      "migrated",
      "read_only_recovery",
      "failed"
    ],
    "OfficialNoticeStatus": [
      "active",
      "withdrawn",
      "superseded"
    ],
    "TurnCommandSource": [
      "player_turn",
      "world_due",
      "manual",
      "debug",
      "migration",
      "path_command",
      "system"
    ],
    "TurnAttemptPhase": [
      "draft",
      "validating",
      "committing",
      "committed",
      "revealing",
      "revealed",
      "aborted",
      "recovery_required"
    ],
    "TurnRecoveryAction": [
      "resume_reveal",
      "replay_projection",
      "restore_pre_turn",
      "await_user_confirmation"
    ],
    "NarrativeConsistencyCode": [
      "illegal_narrative_replay",
      "terminal_event_resurrection",
      "narrative_no_progress",
      "narrative_multi_unit",
      "unsupported_future_leap",
      "player_action_not_accepted",
      "knowledge_leak",
      "unregistered_emergent_event"
    ],
    "NarrativeRewriteOperation": [
      "reframe_as_consequence",
      "remove_unsupported_claims",
      "continue_current_focus"
    ],
    "NarrativeDecisionOutcome": [
      "allow",
      "allow_reframed",
      "retry",
      "reject",
      "hold"
    ],
    "NarrativePublicationStatus": [
      "accepted_pending_reveal",
      "revealed",
      "held",
      "discarded"
    ],
    "ArticleAudienceKind": [
      "player_observer",
      "player_character",
      "npc",
      "faction"
    ],
    "PayloadMatcherOperator": [
      "equals",
      "one_of",
      "gte",
      "lte",
      "contains"
    ],
    "AdvanceTimeReason": [
      "turn_default",
      "narrative_duration",
      "player_wait",
      "travel",
      "world_due"
    ],
    "PathCommandAction": [
      "enter",
      "decline",
      "judge"
    ],
    "EvidenceRefKind": [
      "narrative_span",
      "system_command",
      "gameplay_receipt",
      "schedule_record",
      "notice_record",
      "broadcast_record",
      "article_version",
      "migration_record",
      "projection_record",
      "narrative_publication"
    ],
    "PublicScopeKind": [
      "private",
      "local",
      "faction",
      "public",
      "broadcast"
    ],
    "NewsSourceRefKind": [
      "committed_fact",
      "public_schedule",
      "official_notice",
      "article_version",
      "manual"
    ],
    "KnowledgeSubjectRefKind": [
      "committed_fact",
      "public_schedule",
      "official_notice",
      "article_version"
    ],
    "StoryAssetCatalogSourceKind": [
      "builtin_canon",
      "user_import",
      "legacy_migrated",
      "user_authored"
    ],
    "StoryAssetConstraintKind": [
      "hard",
      "foreshadow"
    ],
    "StoryAssetProfileImportance": [
      "ordinary",
      "important",
      "core"
    ],
    "StoryAssetLocationLevel": [
      "cosmos",
      "major",
      "medium",
      "minor",
      "zone",
      "sublocation",
      "unknown"
    ],
    "StoryAssetParticipationPolicy": [
      "player_optional",
      "player_required_for_resolution",
      "world_only"
    ],
    "StoryAssetBypassPolicy": [
      "remain_available",
      "world_background",
      "supersede",
      "expire"
    ],
    "StoryAssetDeviationPolicy": [
      "continue_compatible",
      "branch_candidate",
      "supersede",
      "hold"
    ],
    "StoryAssetEarlyCompletionPolicy": [
      "resolve_same_definition",
      "hold_for_evidence",
      "not_applicable"
    ],
    "StoryAssetOccurrencePolicy": [
      "unique",
      "allow_new_instance",
      "repeatable"
    ],
    "StoryAssetNewInstancePolicy": [
      "forbidden",
      "explicit_cause_required",
      "allowed"
    ],
    "StoryAssetOccurrenceSubjectKind": [
      "event",
      "character",
      "facility",
      "item",
      "task_result"
    ]
  }
} as const;

export type StoryRuntimeTypeName =
  'ArticlePolicy'
  | 'AudienceSelector'
  | 'AudienceSnapshot'
  | 'BroadcastEnvelope'
  | 'CommittedWorldFact'
  | 'CompletionPredicate'
  | 'ConvergenceItem'
  | 'ConvergenceProposal'
  | 'CreateEventProposal'
  | 'DeliveryRecord'
  | 'EmergentEventDefinition'
  | 'EmergentEventDefinitionProposal'
  | 'EventTargetRef'
  | 'EvidenceRef'
  | 'FactProposal'
  | 'GameClock'
  | 'GameTime'
  | 'KnowledgeGrant'
  | 'KnowledgeGrantProposal'
  | 'KnowledgeReceipt'
  | 'KnowledgeSubjectRef'
  | 'NarrativeConsistencyDecision'
  | 'NarrativePublicationRecord'
  | 'NarrativeRewriteRequest'
  | 'NewsArticleAggregate'
  | 'NewsArticleVersion'
  | 'NewsSourceRef'
  | 'ObserverReadCursor'
  | 'OfficialNotice'
  | 'OfficialNoticeProposal'
  | 'OpeningPrelude'
  | 'OpeningPreludeSourceRef'
  | 'PayloadMatcher'
  | 'PlanItemProposal'
  | 'PlayerPlanItem'
  | 'ProjectionOutboxItem'
  | 'PublicSchedule'
  | 'PublicScheduleProposal'
  | 'PublicScope'
  | 'RuntimeCommand'
  | 'RuntimeMigrationMeta'
  | 'StoryAssetCatalog'
  | 'StoryAssetChapter'
  | 'StoryAssetChapterRange'
  | 'StoryAssetCharacterProfile'
  | 'StoryAssetConstraint'
  | 'StoryAssetFactionProfile'
  | 'StoryAssetLocationProfile'
  | 'StoryAssetOccurrenceDefinition'
  | 'StoryAssetOccurrenceSubjectRef'
  | 'StoryAssetRoutePolicy'
  | 'StoryAssetSegment'
  | 'StoryAssetSeries'
  | 'StoryAssetTimelineEntry'
  | 'StoryAssetVisibilityHint'
  | 'StoryFocus'
  | 'StoryProjectionState'
  | 'StoryRuntimeState'
  | 'StoryRuntimeView'
  | 'TurnAdjudicationReceipt'
  | 'TurnAttemptReceipt'
  | 'WorldEntityState'
  | 'WorldEventDefinition'
  | 'WorldEventDefinitionScheduling'
  | 'WorldEventInstance'
  | 'WorldPlanItem';
