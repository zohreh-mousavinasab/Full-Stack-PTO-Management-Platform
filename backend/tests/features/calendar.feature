Feature: Calendar

  Scenario: Calendar shows leave and holidays for the selected range
    Given a calendar range is configured
    When the calendar view loads
    Then it shows holidays and PTO requests inside the range

  Scenario: Calendar can move to the previous month
    Given the calendar is showing a month range
    When the user clicks previous month
    Then the date range changes to the prior month

  Scenario: Calendar can move to the next month
    Given the calendar is showing a month range
    When the user clicks next month
    Then the date range changes to the next month

  Scenario: Calendar shows per-day agenda entries
    Given PTO requests overlap a selected day
    When the agenda renders that day
    Then the day shows all matching requests and any holiday badge

  Scenario: Conflict watch appears when overlaps exist
    Given conflicting requests are present
    When the calendar loads
    Then the conflict watch panel is visible
