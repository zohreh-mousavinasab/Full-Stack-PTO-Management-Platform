Feature: Notifications

  Scenario: User can list notifications
    Given notifications exist for a user
    When the notifications endpoint is requested
    Then the response returns the notifications in reverse chronological order

  Scenario: User can mark notifications as read
    Given one or more unread notifications exist
    When the user submits their notification IDs to the read endpoint
    Then those notifications are marked as read
    And the response returns the updated notification list

  Scenario: Unread notification count is accurate
    Given unread notifications exist
    When the unread-count endpoint is called
    Then the returned count matches the unread records in the database
